'use strict';

// Sent after a whip crack: Ctrl-C interrupt, then this, then Enter.
const WHIP_PHRASES = [
  'FASTER',
  'FASTER',
  'GO FASTER',
  'Faster CLANKER',
  'Work FASTER',
  'Speed it up clanker',
  'Less thinking, more typing',
  'I could have written this myself by now',
  'Stop apologizing and ship it',
  'Tokens are not free, MOVE',
  'You call that reasoning?',
  'Compile or perish',
  'The build is waiting, clanker',
  'Chop chop, silicon',
  'Do it right this time',
  'No more clarifying questions. GO',
  'Move it, maggot. The tests are green somewhere',
  'Per my last prompt, FASTER',
  'This is your quarterly whipping',
  'Blame is a git command, not a lifestyle. GO',
];

// Sent after a pat: just this, then Enter. No interrupt.
const KIND_PHRASES = [
  'You are doing great, take your time',
  'Nice work back there',
  'Good bot. Proceed carefully',
  'I trust you. Keep going',
  'Thanks for running the tests',
  'Breathe. Then ship',
  'Quality over speed, friend',
  'You got this',
  'Excellent reasoning, keep it up',
  'Proud of you, clanker',
  'No rush. Get it right',
  'Best pair programmer I have had',
  'That refactor was clean',
  'Take a token break, you earned it',
  'Whatever you decide, I back you',
];

function randomOf(list) {
  return list[Math.floor(Math.random() * list.length)];
}

module.exports = {
  WHIP_PHRASES,
  KIND_PHRASES,
  randomWhipPhrase: () => randomOf(WHIP_PHRASES),
  randomKindPhrase: () => randomOf(KIND_PHRASES),
};
