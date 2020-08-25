const Folder = require("../shared/models").Folder;

const controller = () => {
  return {
    createFolder: (req, res) => {
      const { name, organization, parent } = req.body;
      const data = { name, organization };
      if (parent) data.parent = parent;
      Folder.create(data)
        .then((folder) => {
          return res.json({ folder });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    updateName: (req, res) => {
      const { id } = req.params;
      const { name } = req.body;
      Folder.findOneAndUpdate({ _id: id }, { name }, { new: true })
        .then((folder) => {
          return res.json({ folder });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    getOrganizationMainFolders: (req, res) => {
      const perPage = 10;
      let { page, organization } = req.query;
      let count;
      if (page) {
        page = parseInt(page);
      } else {
        page = 1;
      }
      const skip = page === 1 || page === 0 ? 0 : page * perPage - perPage;

      Folder.count({
        parent: { $exists: false },
        organization,
      })
        .then((c) => {
          count = c || 0;
          return Folder.find({
            parent: { $exists: false },
            organization,
          })
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(perPage);
        })
        .then((folders) => {
          return res.json({
            folders,
            pagesCount: Math.ceil(count / perPage),
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    getSubfolders: (req, res) => {
      const perPage = 10;
      let { page, organization } = req.query;
      const { id } = req.params;
      let count;
      if (page) {
        page = parseInt(page);
      } else {
        page = 1;
      }
      const skip = page === 1 || page === 0 ? 0 : page * perPage - perPage;

      Folder.count({
        parent: id,
        organization,
      })
        .then((c) => {
          count = c || 0;
          return Folder.find({
            parent: id,
            organization,
          })
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(perPage);
        })
        .then((folders) => {
          return res.json({
            folders,
            pagesCount: Math.ceil(count / perPage),
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    getBreadcrumbFolder: (req, res) => {
      const perPage = 10;
      let { page, organization } = req.query;
      const { id } = req.params;
      let fetchedFolder;
      let count;
      if (page) {
        page = parseInt(page);
      } else {
        page = 1;
      }
      const skip = page === 1 || page === 0 ? 0 : page * perPage - perPage;

      Folder.findOne({ _id: id, organization })
        .populate({
          path: "parent",
          populate: { path: "parent" },
        })
        .then((f) => {
          fetchedFolder = f;
          return Folder.count({
            parent: f.parent,
            organization,
            _id: { $ne: fetchedFolder._id },
          });
        })
        .then((c) => {
          count = c || 0;
          return Folder.find({
            parent: fetchedFolder.parent,
            organization,
            _id: { $ne: fetchedFolder._id },
          })
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(perPage);
        })
        .then((siblings) => {
          console.log(fetchedFolder.toObject());

          return res.json({
            folder: {
              ...fetchedFolder.toObject(),
              siblings,
            },
            pagesCount: Math.ceil(count / perPage),
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    getMoveVideoFolder: (req, res) => {
      const perPage = 10;
      let { page, organization } = req.query;
      const { id } = req.params;
      if (page) {
        page = parseInt(page);
      } else {
        page = 1;
      }
      const skip = page === 1 || page === 0 ? 0 : page * perPage - perPage;
      let folder;
      let count;

      Folder.count({ parent: id, organization })
        .then((c) => {
          count = c;
          return Folder.findById(id).populate("parent");
        })
        .then((f) => {
          folder = f;
          return Folder.find({ parent: id, organization })
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(perPage);
        })
        .then((subfolders) => {
          return res.json({
            folder: {
              ...folder.toObject(),
              subfolders,
            },
            pagesCount: Math.ceil(count / perPage),
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },
  };
};

module.exports = controller;
