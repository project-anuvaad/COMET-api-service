const NoiseCancellationVideoHandler = require('../../dbHandlers/noiseCancellationVideo');
const BaseService = require('../BaseService');

class NoiseCancellationVideoService extends BaseService {
    constructor() {
        super(NoiseCancellationVideoHandler);
    }
}

module.exports =  new NoiseCancellationVideoService();