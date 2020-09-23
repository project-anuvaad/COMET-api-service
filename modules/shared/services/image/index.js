const ImageHandler = require('../../dbHandlers/image');
const BaseService = require('../BaseService');

class ImageService extends BaseService {
    constructor() {
        super(ImageHandler);
    }

    createImage(values) {
        return this.create(values)
    }
}

module.exports = new ImageService();