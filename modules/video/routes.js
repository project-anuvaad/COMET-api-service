const middlewares = require('./middlewares');
const multer = require('multer');
const fs = require('fs');
const requiredDirs = ['tmp', './tmp'];

var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, '/tmp')
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + '.' + file.originalname.split('.').pop())
    }
})
var upload = multer({ storage: storage })

requiredDirs.forEach(d => {
    if (!fs.existsSync(d)) {
        fs.mkdirSync(d);
    }
})
// external modules should call the mount function and pass it an instance 
// of the router to add the module's routes to it
const mount = function (router, rabbitmqChannel) {
    // Define module routes here
    
    const workers = require('./workers')({ rabbitmqChannel })
    const controller = require('./controller')({ workers });
    
    require('./rabbitmqHandlers').init({ channel: rabbitmqChannel, workers })

    router.get('/whatsapp-bot', controller.getVideoForWhatsApp);

    router.get('/', controller.getVideos);
    router.get('/count', controller.getVideosCount);

    router.post('/upload', upload.any(), middlewares.authorizeUploadVideo, middlewares.create_video, controller.uploadVideo)

    router.patch('/:id/backgroundMusic', upload.any(), middlewares.authorizeUploadVideo, controller.uploadBackgroundMusic)
    router.post('/:id/backgroundMusic/extract', middlewares.authorizeVideoAdmin, controller.extractVideoBackgroundMusic)
    router.delete('/:id/backgroundMusic', middlewares.authorizeVideoAdmin, controller.deleteBackgroundMusic)


    router.post('/:id/convert', middlewares.authorizeAdminAndReviewer, controller.convertVideo);
    router.post('/:id/refreshMedia', middlewares.authorizeAdminAndReviewer, controller.refreshMedia);

    router.post('/:id/automaticBreak', controller.automaticCutVideo)
    router.post('/all/transcribe', controller.transcribeAllVideos);
    router.post('/:id/transcribe', middlewares.authorizeAdminAndReviewer, controller.transcribeVideo)
    router.post('/:id/transcribe/skip', middlewares.authorizeAdminAndReviewer, controller.skipTranscribe)

    router.put('/:id/reviewers', middlewares.authorizeVideoAdmin, controller.updateReviewers)
    router.post('/:id/reviewers/resendEmail', middlewares.authorizeVideoAdmin, controller.resendEmailToReviewer)

    router.put('/:id/verifiers', middlewares.authorizeVideoAdmin, controller.updateVerifiers)
    router.post('/:id/verifiers/resendEmail', middlewares.authorizeVideoAdmin, controller.resendEmailToVerifier)

    router.put('/:id/projectLeaders', middlewares.authorizeVideoAdmin, controller.updateProjectLeaders)

    router.put('/:id/folder', middlewares.authorizeVideoAdmin, controller.updateFolder);

    router.get('/:id', controller.getVideoById);
    router.patch('/:id', upload.any(), middlewares.authorizeVideoAdmin, controller.updateVideo);
    router.delete('/:id', middlewares.authorizeOwnerAndAdmin, controller.deleteVideo)

    return router;
}

module.exports = {
    mount,
}
