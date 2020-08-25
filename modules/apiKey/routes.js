const controller = require('./controller');
const middlewares = require('./middlewares');
// external modules should call the mount function and pass it an instance 
// of the router to add the module's routes to it
const mount = function (router) {
    // Define module routes here
    router.get('/', middlewares.authorizeOrganizationAdmin('query'), controller.get)
    router.post('/', middlewares.authorizeOrganizationAdmin('body'), middlewares.validateOrigins, middlewares.validatePermissions, controller.create)
    router.delete('/:apiKeyId', middlewares.authorizeDeletekey, controller.delete)

    router.get('/by_key', controller.getApiKeyByKey)
    router.get('/userKey', controller.getUserOrganizationKey)

   
    return router;
}

module.exports = {
    mount,
}
