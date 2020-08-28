const subtitle = require('subtitle');

function isItemInContent(start_time, end_time, item) {
    return parseFloat(item.start_time) >= parseFloat(start_time) && parseFloat(item.end_time) <= parseFloat(end_time);
}

function parseTranscription(transcription, subslides) {
    const { results } = transcription;
    const { items } = results;
    const slidesContent = [];
    
    if (!items || items.length === 0 || !items.find((s) => s.start_time)) return [];

    subslides.forEach(({ startTime, endTime }, slideIndex) => {
        let content = [];
        let slideItems = [];
        items.forEach((item, index) => {

            if (isItemInContent(startTime, endTime, item) ||
                // Add to the content if it's a punctuation and the prev item was in the content
                (item.type === 'punctuation' && index !== 0 && isItemInContent(startTime, endTime, items[index - 1]))
            ) {
                if (item.type === 'punctuation') {
                    content.push(`${item.alternatives[0].content}`);
                } else {
                    content.push(` ${item.alternatives[0].content}`);
                }
                slideItems.push(item);
            }
        })

        slidesContent.push({ startTime, endTime, index: slideIndex, text: content.join('').trim(), items: slideItems })
    })
    return slidesContent;
}

function parseSubtitle(subtitleText) {
    /* eslint-disable no-control-regex */
    const parsedSubtitle = subtitle.parse(subtitleText).map((item) => ({ ...item, speakerLabel: 'spk_1', content: `${item.text} `.replace(/[\r\n\x0B\x0C\u0085\u2028\u2029]+/g, " "), startTime: item.start / 1000, endTime: item.end / 1000, items: [{ start_time: item.start / 1000, end_time: item.end / 1000, type: 'pronunciation', alternatives: [{ content: `${item.text} `.replace(/[\r\n\x0B\x0C\u0085\u2028\u2029]+/g, " ") }] }] }));
    return parsedSubtitle;
}

module.exports = {
    parseTranscription,
    parseSubtitle,
}