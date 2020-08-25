const fs = require("fs");
const controller = require("./controller");
const middlewares = require("./middlewares");

const multer = require("multer");
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "/tmp");
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname +
        "-" +
        Date.now() +
        "." +
        file.originalname.split(".").pop()
    );
  },
});
const upload = multer({ storage: storage });
// external modules should call the mount function and pass it an instance
// of the router to add the module's routes to it
const mount = function (router) {
  // Define module routes here
  router.post(
    "/",
    upload.any(),
    middlewares.validateImagesExtension("multiple"),
    middlewares.authorizeUser,
    controller.createOrganization
  );
  router.patch(
    "/:organizationId/logo",
    upload.single("logo"),
    middlewares.validateImagesExtension("single"),
    middlewares.authorizeOwnerAndAdmin,
    controller.updateLogo
  );

  // This route is deprecated, remove by November
  // router.post('/:organizationId/invitations/respond', controller.respondToInvitation)
  router.post(
    "/:organizationId/invitations/respondAuth",
    controller.respondToInvitationAuth
  );

  router.post(
    "/:organizationId/users",
    middlewares.authorizeOwnerAndAdmin,
    controller.addUser
  );

  router.patch(
    "/:organizationId/users/:userId/permissions",
    middlewares.authorizeOwnerAndAdmin,
    controller.editPermissions
  );
  router.delete(
    "/:organizationId/users/:userId",

    middlewares.authorizeOwnerAndAdmin,
    controller.removeUser
  );

  router.get("/:organizationId", controller.getById);

  return router;
};

module.exports = {
  mount,
};
