const fs = require("fs");
const { storageService } = require("../shared/services");
const Image = require("../shared/models").Image;

const controller = {
  uploadImage: (req, res) => {
    const { title, langCode, organization } = req.body;
    let file = req.files && req.files.find((f) => f.fieldname === "image");

    if (file) {
      storageService
        .saveFile("images", file.filename, fs.createReadStream(file.path))
        .then(({ url }) => {
          return Image.create({
            url,
            title,
            langCode,
            organization,
            type: "original",
            uploadedBy: req.user._id,
          });
        })
        .then((image) => {
          console.log(image);
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

  getImages: (req, res) => {
    const perPage = 2;
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

  updateImage: (req, res) => {
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
};

module.exports = controller;
