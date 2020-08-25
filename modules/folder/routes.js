const controller = require('./controller')();
const middlewares = require('./middlewares');
// external modules should call the mount function and pass it an instance
// of the router to add the module's routes to it
const mount = function (router) {
  // Define module routes here

  router.post(
    "/",
    middlewares.authorizeCreateFolder,
    middlewares.validateCreateFolder,
    controller.createFolder
  );

  router.get("/mainFolders", controller.getOrganizationMainFolders);
  router.get("/:id/breadcrumb", controller.getBreadcrumbFolder);
  router.get("/:id/subfolders", controller.getSubfolders);
  router.get("/:id/moveVideo", controller.getMoveVideoFolder);
  router.put(
    "/:id/name",
    middlewares.validateUpdateName,
    middlewares.authorizeUpdateName,
    controller.updateName
  );
  return router;
};

module.exports = {
  mount,
};
