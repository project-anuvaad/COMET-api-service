const { translationExportService, articleService } = require("../shared/services");
const Subtitles = require("../shared/models").Subtitles;
const utils = require("./utils");
const TranslationExport = require("../shared/models").TranslationExport;

const controller = ({ workers }) => {
  const { exporterWorker } = workers;
  
  return {
    getById: function (req, res) {
      const { id } = req.params;
      Subtitles.findById(id)
        .then((subtitles) => {
          return res.json({ subtitles });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    resetSubtitles: function (req, res) {
      const { id } = req.params;
      let article;
      let subtitles;
      Subtitles.findById(id)
        .then((subtitlesDoc) => {
          if (!subtitlesDoc) throw new Error("Invalid id");
          subtitles = subtitlesDoc.toObject();
          return articleService.findById(subtitles.article);
        })
        .then((articleDoc) => {
          if (!articleDoc) throw new Error("Article doesnt exists");
          article = articleDoc.toObject();

          subtitles.subtitles = utils.generateSubtitlesFromSlides(
            article.slides
          );
          return Subtitles.findByIdAndUpdate(id, {
            $set: { subtitles: subtitles.subtitles, updated_at: Date.now() },
          });
        })
        .then(() => Subtitles.findById(id))
        .then((subtitles) => res.json({ subtitles }))
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    getByArticleId: function (req, res) {
      const { id } = req.params;
      let translationExport;
      let subtitles;
      let article;
      TranslationExport 
        .find({
          article: id,
          status: "done",
        })
        .sort({ created_at: -1 })
        .limit(1)
        .then((translationExports) => {
          if (translationExports && translationExports[0]) {
            translationExport = translationExports[0].toObject();
          }
          return Subtitles.find({ article: id });
        })
        .then((subtitlesDocs) => {
          if (subtitlesDocs && subtitlesDocs.length > 0) {
            subtitles = subtitlesDocs[0];
          }
          if (subtitles && translationExport) {
            return res.json({ subtitles, translationExport });
          }
          if (subtitles) return res.json({ subtitles });
          return articleService
            .findById(id)
            .then((articleDoc) => {
              article = articleDoc;
              return articleService.findById(article.originalArticle);
            })
            .then((originalArticle) => {
              if (
                originalArticle.langCode.indexOf(article.langCode) !== 0 ||
                article.tts
              ) {
                return res.json({ locked: true });
              }
              // No subtitles but same language, generate a new subtitles doc
              const subtitles = utils.generateSubtitlesFromSlides(
                article.slides
              );
              const newSubtitles = {
                article: article._id,
                organization: article.organization,
                video: article.video,
                subtitles,
              };
              return Subtitles.create(newSubtitles)
                .then(() => Subtitles.findOne({ article: article._id }))
                .then((subtitles) => {
                  return res.json({ subtitles: subtitles });
                });
            });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    splitSubtitle: function (req, res) {
      const { id, subtitlePosition } = req.params;
      const { wordIndex, time } = req.body;
      utils
        .splitSubtitle(id, parseInt(subtitlePosition), wordIndex, time)
        .then(() => Subtitles.findById(id))
        .then((subtitles) => {
          return res.json({ subtitles });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    combineSubtitle: function (req, res) {
      const { id } = req.params;
      let { positions } = req.body;

      if (!positions || positions.length < 2)
        return res
          .status(400)
          .send("There must be at least 2 positions to combine");

      positions = positions.map((p) => parseInt(p));

      utils.combi
        .combineSubtitles(id, positions)
        .then(() => Subtitles.findById(id))
        .then((subtitles) => {
          return res.json({ subtitles });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    addSubtitle: function (req, res) {
      const { id } = req.params;
      const { text, startTime, endTime, speakerProfile } = req.body;
      console.log(req.body);
      utils
        .addSubtitle(id, { text, startTime, endTime, speakerProfile })
        .then(() => {
          return Subtitles.findById(id);
        })
        .then((subtitles) => {
          return res.json({ subtitles });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    updateSubtitle: function (req, res) {
      const { id, subtitlePosition } = req.params;
      const changes = req.body;
      utils
        .updateSubtitle(id, subtitlePosition, changes)
        .then((changes) => {
          return res.json({ position: subtitlePosition, ...changes });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    activateSubtitles: function (req, res) {
      const { id } = req.params;
      const { activated } = req.body;
      let subtitles;
      let article;
      let translationExport;
      Subtitles.findById(id)
        .populate('article')
        .then((subtitlesDoc) => {
          if (!subtitlesDoc) throw new Error("Invalid id");
          console.log('GOT SUBTITLE')
          subtitles = subtitlesDoc;
          article = subtitles.article;
          return Subtitles.findByIdAndUpdate(id, { $set: { activated } });
        })
        .then(() =>{ 
          return TranslationExport.find({
            article: subtitles.article._id,
          })
          .sort({ created_at: -1 })
          .limit(1)
        })
        .then((translationExports) => {
          if (translationExports && translationExports.length > 0) {
            translationExport = translationExports[0];
            console.log(JSON.stringify({
              id: translationExport._id,
              videoUrl: translationExport.videoUrl,
              title: article.title,
              langCode: article.langCode,
              langName: article.langName,
              dir: translationExport.dir,
              subtitles: subtitles.subtitles,
            }))
            exporterWorker.burnTranslatedArticleVideoSubtitle(
              {
              id: translationExport._id,
              videoUrl: translationExport.videoUrl,
              title: article.title,
              langCode: article.langCode,
              langName: article.langName,
              dir: translationExport.dir,
              subtitles: subtitles.subtitles,
            }
              
            );
            return translationExportService.updateById(translationExport._id, {
              subtitleUrl: "",
              subtitledVideoUrl: "",
              subtitleProgress: 10,
              subtitledVideoProgress: 10,
            });
          }
          return Promise.resolve();
        })
        .then(() => {
          return res.json({ activated });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    deleteSubtitle: function (req, res) {
      const { id, subtitlePosition } = req.params;
      utils
        .deleteSubtitle(id, parseInt(subtitlePosition))
        .then(() => Subtitles.findById(id))
        .then((subtitles) => {
          return res.json({ subtitles });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },
  };
};

module.exports = controller;
