const {
  DISABLE_PUBLIC_ORGANIZATIONS,
  SUPERUSER_EMAIL,
} = process.env;

const {
    Organization,
} = require('../shared/models')
const middlewares = {
  validateImagesExtension: (mode) => (req, res, next) => {
    const allowedExtensions = ["jpg", "jpeg", "png"];
    let images = [];
    if (mode === "single") {
      images.push(req.file);
    } else {
      images = req.files;
    }
    let allValid = true;
    console.log("files", images, req.files);
    images.forEach((imageFile) => {
      if (
        allowedExtensions.indexOf(imageFile.originalname.split(".").pop()) ===
        -1
      ) {
        allValid = false;
      }
    });

    if (!allValid)
      return res
        .status(400)
        .send(`Allowed file formats ${allowedExtensions.join(", ")}`);
    return next();
  },
  authorizeCreateOrganization: function(req, res, next) {
    const { user } = req;
    if (!user || !user._id || !user.organizationRoles) {
      return res.status(401).send("Unauthorized");
    }
    if (
      DISABLE_PUBLIC_ORGANIZATIONS &&
      parseInt(DISABLE_PUBLIC_ORGANIZATIONS) === 1 &&
      SUPERUSER_EMAIL.toLowerCase() !== user.email.toLowerCase()
      ) {
        return res.status(403).send('Only project admins can create organizations')
    } else {
      return next();
    }

  },
  authorizeUser: function (req, res, next) {
    const { user } = req;
    if (!user || !user._id || !user.organizationRoles) {
      return res.status(401).send("Unauthorized");
    }
    return next();
  },
  authorizeOwnerAndAdmin: function (req, res, next) {
    const { organizationId } = req.params;
    Organization.findById(organizationId)
      .then((organization) => {
        if (!req.user) {
          return res.status(401).send("Unauthorized");
        }
        const userRole = req.user.organizationRoles.find(
          (role) =>
            role.organization._id.toString() === organization._id.toString()
        );
        if (
          !userRole ||
          (!userRole.organizationOwner &&
            userRole.permissions.indexOf("admin") === -1 &&
            userRole.permissions.indexOf("project_leader") === -1)
        ) {
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
