const w = require('./src/services/wordEngine'); w.reloadWords().then(() => { const t = w.getTodayString(); console.log('5-letter today:', w.getDailyWord(5, t, process.env.WORD_SALT)); });
