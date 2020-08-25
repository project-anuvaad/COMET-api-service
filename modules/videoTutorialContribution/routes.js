const multer = require('multer');
const controller = require('./controller');

var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, '/tmp')
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + '.' + file.originalname.split('.').pop())
    }
})
var upload = multer({ storage: storage })

// external modules should call the mount function and pass it an instance 
// of the router to add the module's routes to it
const mount = function (router) {
    // Define module routes here
    
    
    router.post('/', upload.any(), controller.uploadVideo)
    router.get('/', controller.getVideos)

    return router;
}

module.exports = {
    mount,
}
