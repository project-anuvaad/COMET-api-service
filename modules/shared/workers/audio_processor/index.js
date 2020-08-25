const superagent = require('superagent');
const queues = require('../vendors/rabbitmq/queues');


module.exports = ({ rabbitmqChannel, AUDIO_PROCESSOR_API_ROOT }) => {
    
    function processNoiseCancellationVideo(identifier) {
        rabbitmqChannel.sendToQueue(queues.PROCESS_NOISECANCELLATIONVIDEO_AUDIO_QUEUE, new Buffer(JSON.stringify(identifier)), { persistent: true });
    }
    
    function processRecordedAudioViaApi({ url, fileStream, outputFormat }) {
        return new Promise((resolve, reject) => {
            let req;
            if (url) {
                req = superagent.post(`${AUDIO_PROCESSOR_API_ROOT}/process_audio`, { url, outputFormat })
            } else if (fileStream) {
                req = superagent.post(`${AUDIO_PROCESSOR_API_ROOT}/process_audio`)
                .attach('file', fileStream)
                .field('outputFormat', outputFormat);
            }
                
            req.then((res) => {
                    resolve(res.body);
                })
                .catch(err => {
                    reject(err);
                })
        })
    }

    function speedAudioViaApi({ url, fileStream, speed }) {
        return new Promise((resolve, reject) => {
            let req;
            if (url) {
                req = superagent.post(`${AUDIO_PROCESSOR_API_ROOT}/audioSpeed`, { url, speed })
            } else if (fileStream) {
                req = superagent.post(`${AUDIO_PROCESSOR_API_ROOT}/audioSpeed`)
                .attach('file', fileStream)
                .field('speed', speed);
            }
                
            req.then((res) => {
                    resolve(res.body);
                })
                .catch(err => {
                    reject(err);
                })
        })
    }
    
    
    return {
        processRecordedAudioViaApi,
        processNoiseCancellationVideo,
        speedAudioViaApi,
    }
}