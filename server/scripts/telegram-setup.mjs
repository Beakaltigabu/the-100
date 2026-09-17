import 'dotenv/config';

const { TELEGRAM_BOT_TOKEN } = process.env;
if (!TELEGRAM_BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN in server/.env');
  process.exit(1);
}

const base = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const EN_COMMANDS = [
  { command: 'status', description: 'Your progress' },
  { command: 'day', description: 'Your day' },
  { command: 'goal', description: 'Your goal' },
  { command: 'checkin', description: 'Log an activity, e.g. /checkin 8.4' },
  { command: 'streaks', description: 'Top streaks' },
  { command: 'language', description: 'Change language (en/am)' },
  { command: 'help', description: 'All commands' }
];

const AM_COMMANDS = [
  { command: 'status', description: 'እድገትህ' },
  { command: 'day', description: 'ቀንህ' },
  { command: 'goal', description: 'ግብህ' },
  { command: 'checkin', description: 'እንቅስቃሴ መዝግብ፣ ለምሳሌ /checkin 8.4' },
  { command: 'streaks', description: 'ከፍተኛ ቀጣይነቶች' },
  { command: 'language', description: 'ቋንቋ ቀይር (en/am)' },
  { command: 'help', description: 'ሁሉም ትዕዛዞች' }
];

async function post(method, body) {
  const res = await fetch(`${base}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return data;
}

async function main() {
  await post('setMyCommands', { commands: EN_COMMANDS });
  console.log('setMyCommands (en): ok');

  await post('setMyCommands', { commands: AM_COMMANDS, language_code: 'am' });
  console.log('setMyCommands (am): ok');

  await post('setMyShortDescription', {
    short_description: '100 days. Your goal. Your commitment.'
  });
  console.log('setMyShortDescription (en): ok');

  await post('setMyShortDescription', {
    short_description: '100 ቀናት። ግብህ። ቁርጠኝነትህ።',
    language_code: 'am'
  });
  console.log('setMyShortDescription (am): ok');

  await post('setMyDescription', {
    description:
      'THE 100 is a 100-day commitment movement. Log activities, hit milestones, and finish what you started.\n\nUse /start to link your account.'
  });
  console.log('setMyDescription (en): ok');

  await post('setMyDescription', {
    description:
      'THE 100 የ100 ቀናት ቁርጠኝነት እንቅስቃሴ ነው። እንቅስቃሴዎችን መዝግብ፣ መለያ ነጥቦች ላይ ድረስ፣ የጀመርከውን ጨርስ።\n\nመለያህን ለማገናኘት /start ተጠቀም።',
    language_code: 'am'
  });
  console.log('setMyDescription (am): ok');

  console.log('Bot setup complete.');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});