const fs = require("fs");
const Image = require("../shared/models").Image;

const middlewares = {
  authorizeUploadImage: async function (req, res, next) {
    const { organization } = req.body;
    const userRole = req.user.organizationRoles.find(
      (role) => role.organization._id.toString() === organization
    );
    if (!userRole) {
      if (req.file && req.file.path) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(401).send("Unauthorized");
    }
    return next();
  },

  authorizeUpdateImage: function (req, res, next) {
    const { id } = req.params;
    Image.findById(id)
      .then((video) => {
        const userRole = req.user.organizationRoles.find(
          (role) =>
            role.organization._id.toString() === video.organization.toString()
        );
        if (!userRole) {
          return res.status(401).send("Unauthorized");
        }
        return next();
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },
};

module.exports = middlewares;
