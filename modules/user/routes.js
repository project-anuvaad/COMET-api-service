const controller = require('./controller');

// external modules should call the mount function and pass it an instance
// of the router to add the module's routes to it
const mount = function (router) {
  // Define module routes here
   router.get('/', controller.getAll)
    router.get("/getOrgUsers", controller.getOrgUsers);
    router.get("/count", controller.getOrgUsersCounts);
    router.get("/getUserDetails", controller.getUserDetails);
    router.get("/isValidToken", controller.isValidToken);
    router.get('/isSuperUser', controller.isSuperUser)

    router.patch('/showUserGuiding', controller.updateShowUserGuiding)
    router.patch('/showCuttingTutorial', controller.updateShowCuttingTutorial)
    router.patch('/showProofreadingTutorial', controller.updateShowProofreadingTutorial)
    router.patch('/showTranslatingTutorial', controller.updateShowTranslatingTutorial)

    router.patch('/:userId/password', controller.updatePassword);
    router.post('/resetPassword', controller.resetPassword);
    router.get('/:id', controller.getById)

   return router;
};

module.exports = {
  mount,
};
