const async = require('async');

const {
  translationExportService,
  userService,
} = require('../shared/services')

const Subtitles = require('../shared/models').Subtitles

function validateArticleExport(article) {
  if (article.articleType !== 'translation') return { valid: false, message: 'Only Translation articles can be exported' };
  const { slides } = article;
  const allSubslides = slides.filter((s) => s.content && s.content.length > 0).reduce((acc, s) => acc.concat(s.content), []).filter((s) => !s.silent && s.speakerProfile.speakerNumber !== -1);
  if (allSubslides.every((subslide) => subslide.text && subslide.audio)) return { valid: true };
  return { valid: false, message: 'All slides should have audio and text' }
}

function getTranslationExportWithUsersFields(translationExportId) {
  return new Promise((resolve, reject) => {

    translationExportService.findById(translationExportId)
      .then((translationExport) => {
        translationExport = translationExport.toObject();
        const fetchUsers = [
          { field: 'exportRequestBy', id: translationExport.exportRequestBy },
          { field: 'approvedBy', id: translationExport.approvedBy },
          { field: 'declinedBy', id: translationExport.declinedBy },
          { field: 'translationBy', ids: translationExport.translationBy },
        ]
        const fetchUsersFuncArray = [];
        translationExport.translationBy = [];
        fetchUsers.forEach(p => {
          if (p.id) {
            fetchUsersFuncArray.push(cb => {
              userService.findById(p.id)
                .then((userData) => {
                  translationExport[p.field] = {
                    firstname: userData.firstname,
                    lastname: userData.lastname,
                    email: userData.email,
                  }
                  cb();
                })
                .catch(err => {
                  console.log(err);
                  cb();
                })
            })
          } else if (p.ids) {
            p.ids.forEach((id) => {
              fetchUsersFuncArray.push(cb => {
                userService.findById(id)
                  .then((userData) => {
                    translationExport[p.field].push({
                      firstname: userData.firstname,
                      lastname: userData.lastname,
                      email: userData.email,
                    })
                    cb();
                  })
                  .catch(err => {
                    console.log(err);
                    cb();
                  })
              })
            })
          }

        })
        async.parallelLimit(fetchUsersFuncArray, 2, () => {
          return resolve(translationExport);
        })
      })
      .catch(reject)
  })
}

module.exports = {
  validateArticleExport,
  getTranslationExportWithUsersFields,

  getDurationBeforeWord(text, duration, wordIndex) {
    const wordTime = duration / text.split(' ').length;
    return text.split(' ').slice(0, wordIndex).length * wordTime;
  },

  getOverlappedSubtitle({ startTime, endTime }, subtitles, skipPositions = []) {
    skipPositions = skipPositions.map(s => parseInt(s));
    return subtitles.filter(s => skipPositions.indexOf(s.position) === -1).find(s => {
      // exact startTime/endTime
      if (s.startTime === startTime || s.endTime === endTime) return true;
      // new subtitle is dropped in the range of another subtitle
      if (endTime < s.endTime && startTime > s.startTime) return true;
      // new subtite startTime is within another subtitle
      console.log(s.startTime, s.endTime, startTime, s.startTime < startTime, s.endTime > startTime)
      if (s.startTime < startTime && s.endTime > startTime) return true;
      // new subtite endTime is within another subtitle
      if (s.startTime < endTime && s.endTime > endTime) return true;

      if (s.endTime < startTime) return true;
      if (s.endTime)
        return false;
    });
  },

  addSubtitle(subtitleId, body) {
    return new Promise((resolve, reject) => {
      Subtitles.findById(subtitleId)
        .then((subtitles) => {
          if (!subtitles) throw new Error('Invalid subtitle id');
          subtitles = subtitles.toObject();
          const { text, startTime, endTime, speakerProfile } = body;
          if (!startTime || !endTime || !speakerProfile || speakerProfile.speakerNumber === undefined) {
            throw new Error('required fields: text|startTime|endTime|speakerProfile{speakerNumber}');
          }
          // const overlappedSubtitle = this.getOverlappedSubtitle({startTime, endTime}, subtitles.subtitles)
          // console.log('overlapped is',  overlappedSubtitle);
          // if (overlappedSubtitle) throw new Error('Invalid subtitle position');
          subtitles.subtitles.push({
            text: text || '',
            startTime,
            endTime,
            speakerProfile,
          })
          const newSubtitles = subtitles.subtitles.sort((a, b) => a.startTime - b.startTime).map((s, index) => ({ ...s, position: index }));

          return Subtitles.findByIdAndUpdate(subtitleId, { $set: { subtitles: newSubtitles, updated_at: Date.now() } });
        })
        .then((r) => resolve(r))
        .catch(reject)
    });
  },

  updateSubtitle(subtitleId, subtitlePosition, changes) {
    return new Promise((resolve, reject) => {
      Subtitles.findById(subtitleId)
        .then((subtitleDoc) => {
          let subtitles = subtitleDoc.toObject();
          const subtitleIndex = subtitles.subtitles.findIndex(s => s.position === parseInt(subtitlePosition));
          const subtitleItem = subtitles.subtitles[subtitleIndex];
          if (subtitleIndex === -1) throw new Error('Invalid position');
          const update = {
            updated_at: Date.now(),
          };
          const changesKeys = Object.keys(changes);
          changesKeys.forEach((key) => {
            if (key === 'startTime' || key === 'endTime') {
              const prevSubtitle = subtitles.subtitles.find(s => s.position === parseInt(subtitlePosition) - 1);
              const nextSubtitle = subtitles.subtitles.find(s => s.position === parseInt(subtitlePosition) + 1);
              if (key === 'startTime') {
                if (changes[key] >= (changes['endTime'] || subtitleItem.endTime)) {
                  throw new Error('Start time cannot be larger than end time');
                }
                if (!prevSubtitle && changes[key] < 0) {
                  changes[key] = 0;
                } else if (prevSubtitle && changes[key] < prevSubtitle.endTime) {
                  changes[key] = prevSubtitle.endTime;
                }
              } else if (key === 'endTime') {
                if (changes[key] <= (changes['startTime'] || subtitleItem.startTime)) {
                  throw new Error('End time cannot be less than start time');
                }
                if (nextSubtitle && changes[key] > nextSubtitle.startTime) {
                  changes[key] = nextSubtitle.startTime;
                }
              }
            }
            update[`subtitles.${subtitleIndex}.${key}`] = changes[key];
          })
          return Subtitles.findByIdAndUpdate(subtitleId, { $set: update });
        })
        .then(() => resolve(changes))
        .catch(reject)
    })
  },

  splitSubtitle(subtitleId, subtitlePosition, wordIndex, time) {
    return new Promise((resolve, reject) => {
      Subtitles.findById(subtitleId)
        .then((subtitles) => {
          subtitles = subtitles.toObject();
          const subtitleIndex = subtitles.subtitles.findIndex(s => s.position === parseInt(subtitlePosition))
          const splittedSubtitle = subtitles.subtitles[subtitleIndex];
          let newSubtitles = [
            {
              ...splittedSubtitle,
              text: splittedSubtitle.text.split(' ').slice(0, wordIndex).join(' '),
              startTime: splittedSubtitle.startTime,
              endTime: time,
            },
            {
              ...splittedSubtitle,
              text: splittedSubtitle.text.split(' ').slice(wordIndex).join(' '),
              startTime: time,
              endTime: splittedSubtitle.endTime,
            }
          ];
          newSubtitles.forEach((s) => {
            delete s._id;
          })
          subtitles.subtitles.splice(subtitleIndex, 1, ...newSubtitles);
          // Re-update indexes
          subtitles.subtitles = subtitles.subtitles.sort((a, b) => a.startTime - b.startTime).map((subtitle, index) => ({ ...subtitle, position: index }))
          return Subtitles.findByIdAndUpdate(subtitleId, { $set: { subtitles: subtitles.subtitles, updated_at: Date.now() } });
        })
        .then(resolve)
        .catch(reject)
    })
  },

  combineSubtitles(subtitleId, positions = []) {
    return new Promise((resolve, reject) => {
      Subtitles.findById(subtitleId)
        .then((subtitles) => {
          subtitles = subtitles.toObject();
          const combinedSubtitles = subtitles.subtitles.filter((s) => positions.indexOf(s.position) !== -1).sort((a, b) => a.startTime - b.startTime);
          let combinedText = combinedSubtitles.map(s => s.text.trimLeft()).join(' ');
          let newSubtitles = subtitles.subtitles.filter(s => positions.indexOf(s.position) === -1);
          const combinedSingleSubtitle = {
            ...combinedSubtitles[0],
            position: combinedSubtitles[0].position,
            startTime: combinedSubtitles[0].startTime,
            endTime: combinedSubtitles[combinedSubtitles.length - 1].endTime,
            text: combinedText,
          };
          newSubtitles.push(combinedSingleSubtitle);
          newSubtitles = newSubtitles.sort((a, b) => a.startTime - b.startTime);
          return Subtitles.findByIdAndUpdate(subtitleId, { $set: { subtitles: newSubtitles } });
        })
        .then(resolve)
        .catch(reject);
    })
  },

  deleteSubtitle(subtitleId, subtitlePosition) {
    return new Promise((resolve, reject) => {
      Subtitles.findById(subtitleId)
        .then((subtitles) => {
          subtitles = subtitles.toObject();
          const subtitleIndex = subtitles.subtitles.findIndex(s => s.position === parseInt(subtitlePosition))

          subtitles.subtitles.splice(subtitleIndex, 1);
          // Re-update indexes
          subtitles.subtitles = subtitles.subtitles.sort((a, b) => a.startTime - b.startTime).map((subtitle, index) => ({ ...subtitle, position: index }))
          return Subtitles.findByIdAndUpdate(subtitleId, { $set: {subtitles: subtitles.subtitles, updated_at: Date.now()} });
        })
        .then(resolve)
        .catch(reject)
    })
  },

  generateSubtitlesFromSlides(slides) {
    return slides
      .reduce((acc, s) => s.content && s.content.length > 0 ? acc.concat(s.content.map((ss) => ({ ...ss, slidePosition: s.position, subslidePosition: ss.position }))) : acc, [])
      .filter(s => s.speakerProfile && s.speakerProfile.speakerNumber !== -1)
      .sort((a, b) => a.startTime - b.startTime)
      .map((s, index) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        text: s.text,
        position: index,
        speakerProfile: s.speakerProfile,
        slidePosition: s.slidePosition,
        subslidePosition: s.subslidePosition,
      }));

  },
}