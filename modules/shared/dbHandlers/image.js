const ImageModel = require('../models').Image;

const BaseHandler = require('./BaseHandler');

class ImageHandler extends BaseHandler {
    constructor() {
        super(ImageModel);
    }
}

module.exports = new ImageHandler();