const fs = require("fs");
const { storageService, translationService } = require("../shared/services");
const Image = require("../shared/models").Image;
const ColorThief = require("colorthief");

const fabric = require("fabric").fabric;

const uuidv4 = require("uuid").v4;
const Jimp = require("jimp");
const path = require("path");
const async = require("async");

const tesseractService = require("../shared/services/tesseract");
const translatorService = require("../shared/services/translation");

const DEFAULT_DISPLAY_WIDTH = 600;
const DEFAULT_DISPLAY_HEIGHT = 1000;

const DEFAULT_THUBMNAIL_WIDTH = 250;
const DEFAULT_THUMBNAIL_HEIGHT = 250;

const getDisplayWidthAndHeight = (originalWidth, originalHeight) => {
  const aspectRatio = originalHeight / originalWidth;

  let height, width;
  if (originalHeight > DEFAULT_DISPLAY_HEIGHT) {
    height = DEFAULT_DISPLAY_HEIGHT;
    width = height / aspectRatio;
  } else if (originalWidth > DEFAULT_DISPLAY_WIDTH) {
    width = DEFAULT_DISPLAY_WIDTH;
    height = width * aspectRatio;
  }
  return { width, height };
};

const getThumbnailWidthAndHeight = (originalWidth, originalHeight) => {
  const aspectRatio = originalHeight / originalWidth;

  let height, width;
  if (originalHeight > DEFAULT_THUMBNAIL_HEIGHT) {
    height = DEFAULT_THUMBNAIL_HEIGHT;
    width = height / aspectRatio;
  } else if (originalWidth > DEFAULT_THUBMNAIL_WIDTH) {
    width = DEFAULT_THUBMNAIL_WIDTH;
    height = width * aspectRatio;
  }
  return { width, height };
};

const controller = {
  uploadImage: function (req, res) {
    const { title, langCode, organization } = req.body;
    let file = req.files && req.files.find((f) => f.fieldname === "image");

    let thumbnailPath;
    let width, height, displayWidth, displayHeight;
    let uploadedUrl = "";
    let thumbnailUrl = "";
    if (file) {
      storageService
        .saveFile("images", file.filename, fs.createReadStream(file.path))
        .then(({ url }) => {
          uploadedUrl = url;
          return Jimp.read(file.path);
        })
        .then((image) => {
          width = image.getWidth();
          height = image.getHeight();
          thumbnailPath = path.join(
            __dirname,
            `${uuidv4()}.${image.getExtension()}`
          );
          let displayData = getDisplayWidthAndHeight(width, height);
          displayWidth = displayData.width;
          displayHeight = displayData.height;
          const thumbData = getThumbnailWidthAndHeight(width, height);
          return image
            .resize(thumbData.width, thumbData.height)
            .writeAsync(thumbnailPath);
        })
        .then(() =>
          storageService.saveFile(
            "images/thumbnails",
            thumbnailPath.split("/").pop(),
            fs.createReadStream(thumbnailPath)
          )
        )
        .then((uploadRes) => {
          thumbnailUrl = uploadRes.url;

          return Image.create({
            url: uploadedUrl,
            thumbnailUrl,
            title,
            langCode,
            organization,
            type: "original",
            uploadedBy: req.user._id,
            width,
            height,
            displayWidth,
            displayHeight,
          });
        })
        .then((image) => {
          fs.unlink(file.path, () => {});
          fs.unlink(thumbnailPath, () => {});
          return res.json({ image });
        })
        .catch((err) => {
          fs.unlink(thumbnailPath, () => {});
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    } else {
      return res.status(400).send("Please upload an image file");
    }
  },

  getById: function (req, res) {
    const { id } = req.params;
    Image.findById(id)
      .then((image) => {
        return res.json({ image: image.toObject() });
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },

  getImages: function (req, res) {
    const perPage = 10;
    let { organization, page, search } = req.query;
    let count;
    const query = {};
    if (organization) {
      query.organization = organization;
    }
    const queryKeys = Object.keys(req.query);
    if (queryKeys.indexOf("page") !== -1) {
      delete req.query.page;
    }
    if (queryKeys.indexOf("search") !== -1) {
      query.title = new RegExp(search, "ig");
      delete req.query.search;
    }
    if (page) {
      page = parseInt(page);
    } else {
      page = 1;
    }
    const skip = page === 1 || page === 0 ? 0 : page * perPage - perPage;
    Object.keys(req.query).forEach((key) => {
      if (req.query[key]) {
        query[key] = req.query[key];
      }
    });
    Image.count({ ...query })
      .then((c) => {
        count = c || 0;
        return Image.find({ ...query })
          .select("-groups")
          .populate("uploadedBy")
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(perPage);
      })
      .then((images) => {
        return res.json({
          images,
          pagesCount: Math.ceil(count / perPage),
        });
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },

  updateImage: function (req, res) {
    const { id } = req.params;
    const { title, langCode } = req.body;
    const changes = {};
    if (title) {
      changes.title = title;
    }
    if (langCode) {
      changes.langCode = langCode;
    }

    Image.findOneAndUpdate({ _id: id }, { $set: changes }, { new: true })
      .then((image) => {
        return res.json({ image });
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },

  updateGroups: function (req, res) {
    const { id } = req.params;
    const { groups } = req.body;
    Image.findByIdAndUpdate(
      id,
      { $set: { groups, exported: false } },
      { new: true }
    )
      .then((image) => res.json({ image: image.toObject() }))
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },

  updateImageStatus: function (req, res) {
    const { id } = req.params;
    const { status } = req.body;
    Image.findByIdAndUpdate(id, { $set: { status } }, { new: true })
      .then((image) => {
        return res.json({ image: image.toObject() });
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },

  getColors: function (req, res) {
    const { id } = req.params;
    const { left, top, width, height, angle } = req.query;
    let image;
    let imageName = "";
    Image.findById(id)
      .then((imageDoc) => {
        image = imageDoc.toObject();
        return Jimp.read(image.url);
      })
      .then((imageJimp) => {
        imageName = path.join(
          __dirname,
          `${uuidv4()}.${imageJimp.getExtension()}`
        );
        return imageJimp
          .resize(image.displayWidth, image.displayHeight)
          .crop(
            parseFloat(left),
            parseFloat(top),
            parseFloat(width),
            parseFloat(height)
          )
          .writeAsync(imageName);
      })
      .then(() => {
        return ColorThief.getPalette(imageName, 5);
      })
      .then((platte) => {
        fs.unlink(imageName, () => {});
        return res.json({ colors: platte });
      })
      .catch((err) => {
        console.log(err);
        fs.unlink(imageName, () => {});
        return res.status(400).send("Something went wrong");
      });
  },

  getPixelColor: function (req, res) {
    const { id } = req.params;
    const { left, top, width, height, angle } = req.query;
    let image;
    let imageName = "";
    Image.findById(id)
      .then((imageDoc) => {
        image = imageDoc.toObject();
        return Jimp.read(image.url);
      })
      .then((imageJimp) => {
        imageName = path.join(
          __dirname,
          `${uuidv4()}.${imageJimp.getExtension()}`
        );
        return imageJimp
          .resize(image.displayWidth, image.displayHeight)
          .writeAsync(imageName);
      })
      .then(() => Jimp.read(imageName))
      .then((imageJimp) => {
        imageJimp.getPixelColour(
          parseInt(left),
          parseInt(top),
          (err, value) => {
            let color = Jimp.intToRGBA(value);
            color = [color.r, color.g, color.b, color.a];

            fs.unlink(imageName, () => {});
            return res.json({ color });
          }
        );
      })
      .catch((err) => {
        console.log(err);
        fs.unlink(imageName, () => {});
        return res.status(400).send("Something went wrong");
      });
  },

  getText: function (req, res) {
    const { id } = req.params;
    const { left, top, width, height } = req.query;
    let image;
    let imageName = "";
    Image.findById(id)
      .then((imageDoc) => {
        image = imageDoc.toObject();
        return Jimp.read(image.url);
      })
      .then((imageJimp) => {
        imageName = path.join(
          __dirname,
          `${uuidv4()}.${imageJimp.getExtension()}`
        );
        return imageJimp
          .resize(image.displayWidth, image.displayHeight)
          .crop(
            parseFloat(left),
            parseFloat(top),
            parseFloat(width),
            parseFloat(height)
          )
          .grayscale()
          .resize(parseFloat(width) * 3, parseFloat(height) * 3)
          .writeAsync(imageName);
      })
      .then(() => {
        return tesseractService.detectText(imageName);
      })
      .then((text) => {
        fs.unlink(imageName, () => {});
        // return res.json({ text: (text || '').trim().replace(/\n/g, ' ') });
        return res.json({ text: (text || "").trim().replace(/(\n)+/g, "\n") });
      })
      .catch((err) => {
        console.log(err);
        fs.unlink(imageName, () => {});
        return res.status(400).send("Something went wrong");
      });
  },

  getImagesTranslations: function (req, res) {
    const perPage = 10;
    let { organization, page, search } = req.query;
    let count;
    const query = { type: "original" };
    if (organization) {
      query.organization = organization;
    }
    const queryKeys = Object.keys(req.query);
    if (queryKeys.indexOf("page") !== -1) {
      delete req.query.page;
    }
    if (queryKeys.indexOf("search") !== -1) {
      query.title = new RegExp(search, "ig");
      delete req.query.search;
    }
    if (page) {
      page = parseInt(page);
    } else {
      page = 1;
    }
    const skip = page === 1 || page === 0 ? 0 : page * perPage - perPage;
    Object.keys(req.query).forEach((key) => {
      if (req.query[key]) {
        query[key] = req.query[key];
      }
    });
    Image.count({ ...query })
      .then((c) => {
        count = c || 0;
        return Image.find({ ...query })
          .select("-groups")
          .populate("uploadedBy", "firstname lastname email _id")
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(perPage);
      })
      .then((images) => {
        const fetchImagesFuncArray = [];
        images = images.map((i) => i.toObject());

        images.forEach((image) => {
          fetchImagesFuncArray.push((cb) => {
            Image.find({ originalImage: image._id, type: "translation" })
              .select("_id langCode")
              .then((images) => {
                image.translations = images;
                cb();
              })
              .catch((err) => {
                console.log(err);
                image.translations = [];
                cb();
              });
          });
        });
        async.parallelLimit(fetchImagesFuncArray, 10, () => {
          return res.json({
            images,
            pagesCount: Math.ceil(count / perPage),
          });
        });
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },

  translateImage: function (req, res) {
    const { id } = req.params;
    const { langCode } = req.body;
    if (!langCode) return res.status(400).send("Invalid lang code");
    let image;
    let translationImage;
    Image.findById(id)
      .then((imageDoc) => {
        image = imageDoc.toObject();
        if (!image || image.type !== "original") {
          throw new Error("Only images of type original can be translated");
        }
        return Image.find({ originalImage: image._id, langCode });
      })
      .then((tImage) => {
        if (tImage && tImage.length > 0) {
          return res.json({ image: tImage[0].toObject() });
        }

        const clonedImage = { ...image };
        clonedImage.type = "translation";
        clonedImage.originalImage = image._id;
        clonedImage.langCode = langCode;
        delete clonedImage._id;
        return Image.create(clonedImage)
          .then((image) => {
            translationImage = image;
            console.log("created translation", translationImage._id);
            const originalText = [];
            const translateTextFuncArray = [];
            translationImage.groups.forEach((group, i) => {
              translateTextFuncArray.push((cb) => {
                if (group.objects[1]) {
                  originalText.push(group.objects[1].text || "");
                }
                if (!group.objects[1] || !group.objects[1].text) {
                  return cb();
                }
                translatorService
                  .translateText(group.objects[1].text, langCode)
                  .then((translatedText) => {
                    group.objects[1].text = translatedText;
                    return cb();
                  })
                  .catch((err) => {
                    console.log(err);
                    return cb();
                  });
              });
            });
            async.parallelLimit(translateTextFuncArray, 2, (err) => {
              translationImage.originalText = originalText;
              translationImage.save((err) => {
                if (err) {
                  console.log(err);
                  return res.status(400).send("Something went wrong ");
                }
                return res.json({ image: translationImage.toObject() });
              });
            });
          })
          .catch((err) => {});
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send(err.message);
      });
  },
};

module.exports = controller;
