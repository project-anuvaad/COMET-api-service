const {
  websocketsService,
  articleService,
  subtitlesService,
  userService,
  storageService,
  organizationService,
  emailService,
} = require("../shared/services");

const websocketsEvents = require('../shared/services/websockets/websockets/events');

const TranslationExport = require("../shared/models").TranslationExport;
const fs = require("fs");

const BULK_EXPORT_DIRECTORY = "bulkExports";

const queues = require("../shared/workers/vendors/rabbitmq/queues");
const EXPORT_ARTICLE_TRANSLATION_PROGRESS = 'EXPORT_ARTICLE_TRANSLATION_PROGRESS';
const ARCHIVE_ARTICLE_TRANSLATION_AUDIOS_PROGRESS =
  "ARCHIVE_ARTICLE_TRANSLATION_AUDIOS_PROGRESS";
const BURN_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_PROGRESS = `BURN_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_PROGRESS`;
const GENERATE_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_PROGRESS = `GENERATE_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_PROGRESS`; 
const EXPORT_ARTICLE_TRANSLATION_COMPRESSION_FINISH = `EXPORT_ARTICLE_TRANSLATION_COMPRESSION_FINISH`;
const archiver = require('archiver');
const request = require('request')

const { BulkTranslationExport } = require("../shared/models");

let rabbitmqChannel;

function generateZipFile(zipFileName, data) {
  return new Promise((resolve, reject) => {
    const path = `${__dirname}/${zipFileName}_${Date.now()}.zip`;
    const output = fs.createWriteStream(path);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });
    archive.pipe(output);
    data.forEach((d) => {
      archive.append(request(d.url), { name: d.fileName });
    });
    archive.finalize();
    output.on("close", () => {
      resolve(path);
    });
    archive.on("error", (err) => {
      reject(err);
    });
  });
}
function init(channel) {
  rabbitmqChannel = channel;
  rabbitmqChannel.prefetch(1);

  rabbitmqChannel.assertQueue(
    queues.BURN_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_AND_SIGNLANGUAGE_FINISH,
    { durable: true }
  );
  rabbitmqChannel.assertQueue(
    queues.ARCHIVE_ARTICLE_TRANSLATION_AUDIOS_FINISH,
    { durable: true }
  );
  rabbitmqChannel.assertQueue(
    queues.GENERATE_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_FINISH,
    { durable: true }
  );
  rabbitmqChannel.assertQueue(
    queues.BURN_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_FINISH,
    { durable: true }
  );
  rabbitmqChannel.assertQueue(queues.EXPORT_ARTICLE_TRANSLATION_FINISH, {
    durable: true,
  });
  rabbitmqChannel.assertQueue(ARCHIVE_ARTICLE_TRANSLATION_AUDIOS_PROGRESS, {
    durable: true,
  });

  rabbitmqChannel.assertQueue(BURN_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_PROGRESS, {
    durable: true,
  });

  rabbitmqChannel.assertQueue(GENERATE_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_PROGRESS, {
    durable: true,
  });
  rabbitmqChannel.assertQueue(EXPORT_ARTICLE_TRANSLATION_PROGRESS, {
    durable: true,
  });
  rabbitmqChannel.assertQueue(EXPORT_ARTICLE_TRANSLATION_COMPRESSION_FINISH, {
    durable: true,
  });


  rabbitmqChannel.consume(
    queues.BURN_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_AND_SIGNLANGUAGE_FINISH,
    onBurnSignlanguageFinish,
    { noAck: false }
  );

  // Archive article audios
  rabbitmqChannel.consume(
    queues.ARCHIVE_ARTICLE_TRANSLATION_AUDIOS_FINISH,
    onArchiveAudiosFinish,
    { noAck: false }
  );
  rabbitmqChannel.consume(
    ARCHIVE_ARTICLE_TRANSLATION_AUDIOS_PROGRESS,
    onArchiveAudiosProgress,
    { noAck: false }
  );

  // Generate subtitles file
  rabbitmqChannel.consume(
    GENERATE_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_PROGRESS,
    onGenerateSubtitleProgress,
    { noAck: false }
  );
  rabbitmqChannel.consume(
    queues.GENERATE_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_FINISH,
    onGenerateSubtitleFinish,
    { noAck: false }
  );

  // Burn subtitles file
  rabbitmqChannel.consume(
    BURN_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_PROGRESS,
    onBurnSubtitlesProgress,
    { noAck: false }
  );
  rabbitmqChannel.consume(
    queues.BURN_ARTICLE_TRANSLATION_VIDEO_SUBTITLE_FINISH,
    onBurnSubtitlesFinish,
    { noAck: false }
  );
  // Export article translation
  rabbitmqChannel.consume(
    EXPORT_ARTICLE_TRANSLATION_PROGRESS,
    onExportTranslationProgress,
    { noAck: false }
  );
  rabbitmqChannel.consume(
    queues.EXPORT_ARTICLE_TRANSLATION_FINISH,
    onExportTranslationFinish,
    { noAck: false }
  );
  rabbitmqChannel.consume(
    EXPORT_ARTICLE_TRANSLATION_COMPRESSION_FINISH,
    onExportTranslationCompressionFinish,
    { noAck: false }
  );
}

function onExportTranslationProgress(msg) {

  const { id, progress } = JSON.parse(msg.content.toString());
  rabbitmqChannel.ack(msg);
  TranslationExport.findByIdAndUpdate(id, { $set: { status: 'processing', progress }})
  .then(() => {
    console.log('updated progress', id, progress)
  })
  .catch(err => {
    console.log('error updating progress', err)
  })

}

function onExportTranslationFinish(msg) {
  const { id, url, status } = JSON.parse(msg.content.toString());
  console.log("onExportTranslationFinish", id, status);
  rabbitmqChannel.ack(msg);

  if (status === 'failed') {
    return TranslationExport.findByIdAndUpdate(id, { $set: { status: 'failed'}})
    .then(() => {

    })
    .catch(err => {
      console.log(err);
    })
  } else {
    TranslationExport.findByIdAndUpdate(id, { $set: { status: 'done', progress: 100, videoUrl: url }})
    .then(() => {
      addTranslationExportToBulkExport(id);
      createSubtitleForTranslationExport(id);
    })
    .catch(err => {
      console.log(err);
    })
  }

}

function onExportTranslationCompressionFinish(msg) {
  const { id, url } = JSON.parse(msg.content.toString());
  rabbitmqChannel.ack(msg);
  TranslationExport.findByIdAndUpdate(id, { $set: { compressedVideoUrl: url } })
  .then(() => {
    console.log('export compression finished ', id, url)
  })
  .catch(err => {
    console.log(err);
  })
}

function addTranslationExportToBulkExport(translationExportId) {
  BulkTranslationExport.findOne({ translationExportIds: translationExportId })
    .then((bulkTranslationExport) => {
      if (bulkTranslationExport) {
        return BulkTranslationExport.findOneAndUpdate(
          { _id: bulkTranslationExport._id },
          { $addToSet: { finishedTranslationExportIds: translationExportId } },
          { new: true }
        )
          .then((updatedBulkTranslationExport) => {
            if (
              updatedBulkTranslationExport.translationExportIds.length ===
              updatedBulkTranslationExport.finishedTranslationExportIds.length
            ) {
              let organization;
              let zippedFilePath;
              let zipUrl;
              organizationService
                .findOne({ _id: updatedBulkTranslationExport.organization })
                .then((org) => {
                  organization = org;
                  return TranslationExport.find({
                    _id: {
                      $in:
                        updatedBulkTranslationExport.finishedTranslationExportIds,
                    },
                  });
                })
                .then((translationExports) => {
                  const zipData = translationExports.map((te) => {
                    return {
                      url: te.videoUrl,
                      fileName: te.videoUrl.split("/").pop(),
                    };
                  });
                  return generateZipFile(organization.name, zipData);
                })
                .then((zfp) => {
                  zippedFilePath = zfp;
                  return storageService.saveFile(
                    BULK_EXPORT_DIRECTORY,
                    zippedFilePath.split("/").pop(),
                    fs.createReadStream(zippedFilePath)
                  );
                })
                .then(({ url }) => {
                  zipUrl = url;
                  console.log("the uploaded zip file url ", url);
                  fs.unlink(zippedFilePath, (err) => {
                    if (err) console.log("removed zip file", err);
                  });
                  return userService.findOne({
                    _id: updatedBulkTranslationExport.exportBy,
                  });
                })
                .then((user) => {
                  return emailService.sendBulkExportTranslationsZipFile({
                    to: user,
                    organizationName: organization.name,
                    zipUrl,
                  });
                })
                .then(() => {
                  console.log("bulk translation export and download finished");
                })
                .catch((err) => {
                  console.log(err);
                });
            }
          })
          .catch((err) => {
            console.log(err);
          });
      } else {
        console.log("no bulk translation export associated");
      }
    })
    .catch((err) => {
      console.log(err);
    });
}

function createSubtitleForTranslationExport(translationExportId) {
  let translationExport;
  let article;
  TranslationExport.findById(translationExportId)
    .then((translationExportDoc) => {
      if (!translationExportDoc)
        throw new Error("Invalid translation export id" + translationExportId);
      translationExport = translationExportDoc.toObject();
      if (translationExport.status === "failed")
        throw new Error("Failed translation export");
      return articleService.findById(translationExport.article);
    })
    .then((articleDoc) => {
      article = articleDoc.toObject();
      translationExport.article = article;
      return subtitlesService.find({ article: translationExport.article._id });
    })
    .then((subtitles) => {
      // if there's no subtitles generated after the first export, generate one
      if (!subtitles || subtitles.length === 0) {
        const subtitles = subtitlesService.generateSubtitlesFromSlides(
          article.slides
        );
        const newSubtitles = {
          article: article._id,
          organization: article.organization,
          video: article.video,
          subtitles,
        };
        return subtitlesService.create(newSubtitles);
      }
    })
    .then(() => {
      console.log("onExportTranslationFinish done");
    })
    .catch((err) => {
      console.log("error onExportTranlationFinish", err);
    });
}

function onArchiveAudiosProgress(msg) {
  const { id, progress } = JSON.parse(msg.content.toString());
  rabbitmqChannel.ack(msg);

  TranslationExport.findByIdAndUpdate(id, { $set: { audiosArchiveProgress: progress }})
  .then(() => {
    console.log('updated archiveAudios progress ', id, progress)
  })
  .catch(err => {
    console.log(err)
  })

}

function onArchiveAudiosFinish(msg) {
  const { id, url } = JSON.parse(msg.content.toString());
  let translationExport;
  rabbitmqChannel.ack(msg);

  TranslationExport.findByIdAndUpdate(id, { $set: { audiosArchiveUrl: url, audiosArchiveProgress: 100 }}, { new: true })
    .then((translationExportDoc) => {
      if (!translationExportDoc)
        throw new Error("Invalid translation export id");
      translationExport = translationExportDoc.toObject();
      if (!translationExport.audioArchiveBy)
        throw new Error("No one requested to download that");
      return userService.findById(translationExport.audioArchiveBy);
    })
    .then((user) => {
      websocketsService.emitEvent({
        _id: user._id,
        event: websocketsEvents.DOWNLOAD_FILE,
        data: { url: translationExport.audiosArchiveUrl },
      });
    })
    .catch((err) => {
      console.log(err);
    });
}

function onGenerateSubtitleProgress(msg) {
  const { id, progress } = JSON.parse(msg.content.toString());
  rabbitmqChannel.ack(msg);
  TranslationExport.findByIdAndUpdate(id, { $set: { subtitleProgress: progress }})
    .then(() => {
    })
    .catch((err) => {
      console.log(err);
    });
}

function onGenerateSubtitleFinish(msg) {
  const { id, url, status, master } = JSON.parse(msg.content.toString());
  let translationExport;
  rabbitmqChannel.ack(msg);
  if (status === 'failed') {
    return TranslationExport.findByIdAndUpdate(id, { $set: { subtitleProgress: 0 }})
    .then(() => {
      console.log('generate subtitles failed at exporter');
    })
    .catch(err => {
      console.log(err);
    })
  }
  TranslationExport.findByIdAndUpdate(id, { $set: { subtitleProgress: 100, subtitleUrl: url }})
    .then((translationExportDoc) => {
      if (!translationExportDoc)
        throw new Error("Invalid translation export id");
      translationExport = translationExportDoc.toObject();
      if (!translationExport.subtitleBy)
        throw new Error("No one requested to download that");
      return userService.findById(translationExport.subtitleBy);
    })
    .then((user) => {
      if (master) {
        websocketsService.emitEvent({
          _id: user._id,
          event: websocketsEvents.DOWNLOAD_FILE,
          data: { url: translationExport.subtitleUrl },
        });
      }
    })
    .catch((err) => {
      console.log(err);
    });
}

function onBurnSubtitlesProgress(msg) {
  const { id, progress } = JSON.parse(msg.content.toString());

  rabbitmqChannel.ack(msg);
  TranslationExport.findByIdAndUpdate(id, { $set: { subtitledVideoProgress: progress }})
  .then(() => {

  })
  .catch(err => {
    console.log(err)
  })

}

function onBurnSubtitlesFinish(msg) {
  const { id, url, master } = JSON.parse(msg.content.toString());
  let translationExport;
  rabbitmqChannel.ack(msg);
  console.log("downloading burn video");
  TranslationExport.findByIdAndUpdate(id, { $set: { subtitledVideoProgress: 100, subtitledVideoUrl: url }}, { new: true })
    .then((translationExportDoc) => {
      if (!translationExportDoc)
        throw new Error("Invalid translation export id");
      translationExport = translationExportDoc.toObject();
      if (!translationExport.subtitledVideoBy)
        throw new Error("No one requested to download that");
      return userService.findById(translationExport.subtitledVideoBy);
    })
    .then((user) => {
      if (master) {
        websocketsService.emitEvent({
          _id: user._id,
          event: websocketsEvents.DOWNLOAD_FILE,
          data: { url: translationExport.subtitledVideoUrl },
        });
      }
    })
    .catch((err) => {
      console.log(err);
    });
}

function onBurnSignlanguageFinish(msg) {
  const { id, status, url } = JSON.parse(msg.content.toString());
  let translationExport;
  rabbitmqChannel.ack(msg);
  console.log("on burn signlanguage finish ");
  if (status === 'failed') {
    return TranslationExport.findByIdAndUpdate(id, { $set: { subtitledSignlanguageVideoProgress: 0 }})
    .then(() => {
        console.log('onBurnSignlanguageFinish failed in exporter', id, status)
    })
    .catch(err => {
      console.log(err);
    })
  }
  TranslationExport.findByIdAndUpdate(id, { $set: { subtitledSignlanguageVideoProgress: 100, subtitledSignlanguageVideoUrl: url } }, { new: true })
    .then((translationExportDoc) => {
      if (!translationExportDoc)
        throw new Error("Invalid translation export id");
      translationExport = translationExportDoc.toObject();
      if (!translationExport.subtitledSignlanguageVideoBy)
        throw new Error("No one requested to download that");
      return userService.findById(
        translationExport.subtitledSignlanguageVideoBy
      );
    })
    .then((user) => {
      websocketsService.emitEvent({
        _id: user._id,
        event: websocketsEvents.DOWNLOAD_FILE,
        data: { url: translationExport.subtitledSignlanguageVideoUrl },
      });
    })
    .catch((err) => {
      console.log(err);
    });
}

module.exports = {
  init,
};
