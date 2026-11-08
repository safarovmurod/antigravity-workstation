'use strict';

let russian = true;

function setLanguage(language) {
  russian = String(language || '').toLowerCase().startsWith('ru');
}

function isRussian() {
  return russian;
}

function tr(russianText, englishText) {
  return russian ? russianText : englishText;
}

module.exports = { setLanguage, isRussian, tr };
