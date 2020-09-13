const fs = require("fs");
const { storageService } = require("../shared/services");
const Image = require("../shared/models").Image;
const ColorThief = require("colorthief");
const uuidv4 = require("uuid").v4;
const Jimp = require("jimp");
const path = require("path");

const DEFAULT_DISPLAY_WIDTH = 600;
const DEFAULT_DISPLAY_HEIGHT = 600;

const getDisplayWidthAndHeight = (width, height) => {
  const aspectRatio = height / width;

  let displayHeight, displayWidth;
  if (width > DEFAULT_DISPLAY_WIDTH) {
    displayWidth = DEFAULT_DISPLAY_WIDTH;
    displayHeight = displayWidth * aspectRatio;
  } else if (height > DEFAULT_DISPLAY_HEIGHT) {
    displayHeight = DEFAULT_DISPLAY_HEIGHT;
    displayWidth = displayHeight / aspectRatio;
  }
  return { displayWidth, displayHeight };
};

const controller = {
  uploadImage: function (req, res) {
    const { title, langCode, organization } = req.body;
    let file = req.files && req.files.find((f) => f.fieldname === "image");

    let uploadedUrl = "";
    if (file) {
      storageService
        .saveFile("images", file.filename, fs.createReadStream(file.path))
        .then(({ url }) => {
          uploadedUrl = url;
          return Jimp.read(file.path);
        })
        .then((image) => {
          const width = image.getWidth();
          const height = image.getHeight();
          const { displayHeight, displayWidth } = getDisplayWidthAndHeight(width, height);
          return Image.create({
            url: uploadedUrl,
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
          return res.json({ image });
        })
        .catch((err) => {
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
    Image.findByIdAndUpdate(id, { $set: { groups } }, { new: true })
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
    console.log(req.query);
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
};

module.exports = controller;
