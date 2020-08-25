const controller = require("./controller");

// external modules should call the mount function and pass it an instance
// of the router to add the module's routes to it
const mount = function (router) {
  // Define module routes here
  router.post(
    "/organization/:organizationId/invitations/respond",
    controller.respondToOrganizationInvitation
  );
  router.post(
    "/article/:articleId/translators/invitation/respond",
    controller.updateTranslatorInvitation
  );
  router.post(
    "/article/:articleId/textTranslators/invitation/respond",
    controller.updateTextTranslatorInvitation
  );

  return router;
};

module.exports = {
  mount,
};
