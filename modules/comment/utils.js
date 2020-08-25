
function showMoreText(text, length) {
  return text.length > length ? `${text.substr(0, length)} ...` : text;
}

function getSlideIndex(article, slidePosition, subslidePosition) {
  slidePosition = parseInt(slidePosition);
  subslidePosition = parseInt(subslidePosition);
  
  const slidesComments = article.slides
      .reduce((acc, s) => acc.concat(s.content.map((sub) => ({ ...sub, slidePosition: s.position }))), [])
      .filter(s => s.speakerProfile && s.speakerProfile.speakerNumber !== -1)
      .map((s, index) => ({ slidePosition: s.slidePosition, subslidePosition: s.position, index, comments: [] }));
  return slidesComments.find(s => s.slidePosition === slidePosition && s.subslidePosition === subslidePosition).index;
}

function getArticleAssociatedUsers(article, ) {
  const associatedUsers = [];
  article.translators.forEach((translator) => {
      if (associatedUsers.indexOf(translator.user.toString()) === -1) {
          associatedUsers.push(translator.user.toString());
      }
      if (translator.invitedBy && associatedUsers.indexOf(translator.invitedBy.toString()) === -1) {
          associatedUsers.push(translator.invitedBy.toString());
      }
  });
  return associatedUsers;
}

module.exports = {
  showMoreText,
  getSlideIndex,
  getArticleAssociatedUsers,
}