const middlewares = {
    validateImagesExtension: (mode) => (req, res, next) => {
        const allowedExtensions = ['jpg', 'jpeg', 'png'];
        let images = [];
        if (mode === 'single') {
            images.push(req.file);
        } else {
            images = req.files;
        }
        let allValid = true;
        console.log('files', images, req.files)
        images.forEach(imageFile => {
            if (allowedExtensions.indexOf(imageFile.originalname.split('.').pop()) === -1) {
                allValid = false;
            }
        });

        if (!allValid) return res.status(400).send(`Allowed file formats ${allowedExtensions.join(', ')}`);
        return next();
    }
};

module.exports = middlewares;