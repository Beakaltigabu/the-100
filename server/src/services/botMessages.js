function pick(lang, en, am) {
  return lang === 'am' ? am : en;
}

const { formatStartDate } = require('../lib/telegram');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function pct(part, whole) {
  const n = Number(part) || 0;
  const w = Number(whole) || 0;
  return w > 0 ? Math.round((n / w) * 1000) / 10 : 0;
}

module.exports = {
  pick,
  esc,

  // ── Link flow ──────────────────────────────────────
  welcomeLinked: (lang, goal, unit, start, groupLink) =>
    pick(
      lang,
      `🎉 Welcome to <b>THE 100</b> — you're officially in!\n\n📅 Your 100 begins: <b>${start}</b>\n🎯 Goal: <b>${goal} ${unit}</b>\n⏱ Duration: 100 days\n\nYour quick toolkit:\n• /status — track your progress\n• /checkin 8.4 — log today's activity\n• /streaks — view community streaks\n\n👥 Join the community: ${groupLink}\n\nSmall daily steps bring massive results. You've got this. 🔥`,
      `🎉 እንኳን ወደ <b>THE 100</b> በደህና መጣህ — አሁን በይፋ ተቀላቅለሃል!\n\n📅 የ100 ቀን ጉዞህ የሚጀምርበት: <b>${start}</b>\n🎯 የተቀመጠው ግብህ: <b>${goal} ${unit}</b>\n⏱ የቆይታ ጊዜ: 100 ቀናት\n\nፈጣን የትዕዛዝ መሳሪያዎችህ:\n• /status — ያለህበትን እድገት ተከታተል\n• /checkin 8.4 — የእንቅስቃሴ ምዝገባ አድርግ\n• /streaks — የማህበረሰቡን ተከታታይ ስኬቶች ተመልከት\n\n👥 ማህበረሰቡን ይቀላቀሉ: ${groupLink}\n\nበየቀኑ የምታደርጋቸው ትናንሽ እርምጃዎች ወደ ታላቅ ውጤት ይመራሉ! ፅናት ይኑርህ። 🔥`
    ),

  welcomeNoToken: (lang, appUrl, groupLink) =>
    pick(
      lang,
      `Welcome to <b>THE 100</b>!\n\nTo link your account:\n1️⃣ Open the app: ${appUrl}\n2️⃣ Tap <b>JOIN THE COMMUNITY</b>\n3️⃣ Come back here and send /start\n\n👥 Join the community group: ${groupLink}\n\nOne goal. 100 days. Let's go. 🔥`,
      `እንኳን ወደ <b>THE 100</b> በደህና መጣህ!\n\nየቴሌግራም መለያህን ለማገናኘት:\n1️⃣ መተግበሪያውን ክፈት: ${appUrl}\n2️⃣ <b>JOIN THE COMMUNITY</b> የሚለውን ተጫን\n3️⃣ ወደዚህ ተመልሰህ /start የሚለውን ላክ\n\n👥 የማህበረሰቡን ቡድን ይቀላቀሉ: ${groupLink}\n\nአንድ ግብ። 100 ቀናት። ወደፊት እንገስግስ! 🔥`
    ),

  invalidToken: (lang) =>
    pick(
      lang,
      `This link is invalid or expired.\n\nOpen your dashboard and generate a fresh <b>JOIN THE COMMUNITY</b> link.`,
      `ይህ ማገናኛ መስፈንጠሪያ (Link) የተሳሳተ ወይም ጊዜው ያለፈበት ነው።\n\nእባክህ የዳሽቦርድ ገጽህን ከፍተህ አዲስ የ<b>JOIN THE COMMUNITY</b> ማገናኛ ፍጠር።`
    ),

  alreadyLinked: (lang) =>
    pick(
      lang,
      `You're already linked to THE 100. 🎉\n\nTry /status for your progress, or /help for all commands.`,
      `የቴሌግራም መለያህ ቀድሞውኑ ከTHE 100 ጋር ተገናኝቷል! 🎉\n\nያለህበትን ደረጃ ለማየት /status ን፣ ወይም ሁሉንም ትዕዛዞች ለማግኘት /help ን ተጠቀም።`
    ),

  // Shown on a bare /start when the member is ALREADY linked: welcome them with
  // their own data + the group invite instead of the "go to the app" instructions.
  welcomeBack: (lang, goal, unit, day) =>
    pick(
      lang,
      `👋 Welcome back to <b>THE 100</b> — you're still in!\n\n🎯 Goal: <b>${goal} ${unit}</b>\n${day ? `📅 Day: <b>${day}/100</b>\n` : ''}\nHere's your community invite below — your crew is waiting. 🔥`,
      `👋 እንኳን ወደ <b>THE 100</b> በደህና ተመለስክ — የጀመርከው ጉዞ አሁንም ቀጥሏል!\n\n🎯 ግብህ: <b>${goal} ${unit}</b>\n${day ? `📅 ያለህበት ቀን: <b>${day}/100</b>\n` : ''}\nየማህበረሰቡ ጥሪ ከታች ይገኛል — የልምምድ ጓደኞችህ እየጠበቁህ ነው! 🔥`
    ),

  notLinked: (lang) =>
    pick(
      lang,
      `Your Telegram isn't linked yet.\n\nOpen your dashboard and tap <b>JOIN THE COMMUNITY</b> to get started.\n\nTry /help for commands.`,
      `የቴሌግራም መለያህ እስካሁን አልተገናኘም።\n\nጉዞህን ለመጀመር ዳሽቦርድህን በመክፈት <b>JOIN THE COMMUNITY</b> የሚለውን ተጫን።\n\nየትዕዛዞችን ዝርዝር ለማየት /help ን ተጠቀም።`
    ),

  noEnrollment: (lang) =>
    pick(
      lang,
      `You're linked, but haven't committed to a goal yet.\n\nOpen the app and choose your 100 — your spot is waiting. 🎯`,
      `መለያህ ተገናኝቷል፤ ነገር ግን እስካሁን ምንም አይነት ግብ አልመረጥክም።\n\nመተግበሪያውን በመክፈት የ100 ቀን ግብህን ወስን — ዝግጁ የሆንከውን ቦታ እየጠበቅንህ ነው! 🎯`
    ),

  // ── Password reset ─────────────────────────────────
  resetLink: (lang, url) =>
    pick(
      lang,
      `🔐 Password reset requested.\n\nOpen this link within 15 minutes to set a new password:\n${url}\n\nIf this wasn't you, you can safely ignore this message.`,
      `🔐 የይለፍ ቃል መቀየሪያ ጥያቄ ቀርቧል።\n\nበ15 ደቂቃ ውስጥ አዲስ የይለፍ ቃል ለማዘጋጀት ይህንን ማገናኛ ተጠቀም:\n${url}\n\nይህን ጥያቄ እርስዎ ካልላኩት፡ ይህንን መልእክት በቸልታ ማለፍ ይችላሉ።`
    ),

  // ── Personal notifications ─────────────────────────
  commitment: (lang, goal, unit) =>
    pick(
      lang,
      `🎯 Your 100 starts now!\n\nGoal: <b>${goal} ${unit}</b> · Day 1 of 100\n\n• Log with /checkin 8.4\n• Watch your /status\n• Hit milestones to celebrate\n\nDay 1 starts today. Let's move. 🔥`,
      `🎯 የ100 ቀን የፅናት ጉዞህ አሁን ተጀምሯል!\n\nግብህ: <b>${goal} ${unit}</b> · ቀን 1 ከ100\n\n• ያከናወንከውን በ/checkin 8.4 መዝግብ\n• በ/status የደረስክበትን ተከታተል\n• አዳዲስ ምዕራፎችን በማሳካት አክብር\n\nየመጀመሪያው ቀን ዛሬ ይጀምራል። ወደ ፊት እንገስግስ! 🔥`
    ),

  milestoneHit: (lang, threshold, unit) =>
    pick(
      lang,
      `🎉 Milestone! You just hit <b>${threshold} ${unit}</b>.\n\nThat's real progress — keep the momentum going. The next milestone is waiting. 🔥`,
      `🎉 ድንቅ ምዕራፍ! አሁን <b>${threshold} ${unit}</b> ማሳካት ችለሃል።\n\nይህ ትልቅ እመርታ ነው — የጀመርከውን የቁርጠኝነት መንፈስ አጠናክረህ ቀጥልበት! ቀጣዩ ምዕራፍ እየጠበቀህ ነው። 🔥`
    ),

  weeklyCheckin: (lang, total, goal, unit) =>
    pick(
      lang,
      `🗓 How did your week go?\n\nYou're at <b>${total} / ${goal} ${unit}</b> (${pct(total, goal)}%).\n\nLog this week's activities to keep your streak alive. 🔥`,
      `🗓 የዚህ ሳምንት ጉዞህ እንዴት ነበር?\n\nአሁን <b>${total} / ${goal} ${unit}</b> (${pct(total, goal)}%) ላይ ደርሰሃል።\n\nየተከታታይ ስኬት (Streak) ሰንሰለትህ እንዳይቋረጥ የዚህን ሳምንት እንቅስቃሴዎችህን አሁኑኑ መዝግብ! 🔥`
    ),

inactivity: (lang, days) =>
    pick(
      lang,
      days == null
        ? `💤 Your 100 is waiting for you.\n\nYou haven't logged anything yet — one check-in is all it takes to get started.\n\nSend /checkin 8.4 or open the app. You're in this. 🔥`
        : `💤 Your 100 is waiting for you.\n\nIt's been ${days} day(s) since your last activity — one check-in is all it takes to get back in.\n\nSend /checkin 8.4 or open the app. You're still in this. 🔥`,
      days == null
        ? `💤 100ህ እየጠበቀህ ነው።\n\nእስካሁን ምንም እንቅስቃሴ አልመዘገብክም — ለመጀመር አንድ ቼክ-ኢን በቂ ነው።\n\n/checkin 8.4 ላክ ወይም መተግበሪያውን ክፈት። በውስጡ ነህ። 🔥`
        : `💤 100ህ እየጠበቀህ ነው።\n\nየመጨረሻው እንቅስቃሴህ ከ${days} ቀናት በፊት ነበር — አንድ ቼክ-ኢን ብቻ እንደገና ሊያስጀምርህ ይችላል።\n\n/checkin 8.4 ላክ ወይም መተግበሪያውን ክፈት። አሁንም በውስጡ ነህ። 🔥`
    ),

  finish: (lang, goal, unit) =>
    pick(
      lang,
      `🏁 <b>YOU DID IT.</b>\n\nYou finished what you started — <b>${goal} ${unit}</b> in 100 days.\n\nThat's THE 100. Go celebrate. 🎉`,
      `🏁 <b>አስደናቂ ውጤት — ፈጽመኸዋል!</b>\n\nየጀመርከውን ታላቅ ጉዞ በስኬት አጠናቀሃል — በ100 ቀናት ውስጥ <b>${goal} ${unit}</b>።\n\nይህ ነው THE 100! እንኳን ደስ አለህ፣ በስኬትህ ተደሰት! 🎉`
    ),

  // ── Commands ───────────────────────────────────────
  statusReply: (lang, goal, total, unit, day) =>
    pick(
      lang,
      `📊 <b>THE 100</b>\n\n🎯 Goal: <b>${goal} ${unit}</b>\n🏃 Progress: <b>${total} ${unit}</b>\n📅 Day: <b>${day}/100</b>\n🔥 <b>${pct(total, goal)}%</b> there\n\nKeep moving — the streak is watching.`,
      `📊 <b>የTHE 100 የሁኔታ መግለጫ</b>\n\n🎯 ግብ: <b>${goal} ${unit}</b>\n🏃 የደረስክበት: <b>${total} ${unit}</b>\n📅 ቀን: <b>${day}/100</b>\n🔥 <b>${pct(total, goal)}%</b> አጠናቅቀሃል\n\nማቆም የለም — የተከታታይ ስኬትህ (Streak) እየተከታተለህ ነው!`
    ),

  statusPreLaunch: (lang, goal, unit, days, startISO) =>
    pick(
      lang,
      `📊 <b>THE 100</b>\n\n🎯 Goal: <b>${goal} ${unit}</b>\n⏳ Starts in <b>${days}</b> day(s) — ${formatStartDate(startISO, 'en')}.\n\nUse this time to get ready. Your 100 is coming. 🔥`,
      `📊 <b>የTHE 100 የሁኔታ መግለጫ</b>\n\n🎯 ግብ: <b>${goal} ${unit}</b>\n⏳ በ<b>${days}</b> ቀን/ቀናት ውስጥ ይጀምራል — ${formatStartDate(startISO, 'am')}።\n\nይህንንን ጊዜ ለዝግጅት ተጠቀምበት። የ100 ቀን ጉዞህ በቅርቡ ይጀምራል! 🔥`
    ),

  dayReply: (lang, day) =>
    pick(
      lang,
      `📅 <b>DAY ${day} / 100</b>\n\nOne day at a time. Log today's activity to keep it going. 🔥`,
      `📅 <b>ቀን ${day} / 100</b>\n\nእያንዳንዱ ቀን አዲስ እድል ነው! የዛሬውን እንቅስቃሴ በመመዝገብ ጉዞህን አቀጣጥል። 🔥`
    ),

  dayPreLaunch: (lang, days, startISO) =>
    pick(
      lang,
      `⏳ The 100 starts in <b>${days}</b> day(s).\n\n${formatStartDate(startISO, 'en')} is almost here — get ready. 🔥`,
      `⏳ የTHE 100 ጉዞ በ<b>${days}</b> ቀን/ቀናት ውስጥ ይጀምራል።\n\n${formatStartDate(startISO, 'am')} በጣም ተቃርቧል — ራስህን አዘጋጅ! 🔥`
    ),

  goalReply: (lang, goal, unit, pace) =>
    pick(
      lang,
      `🎯 Your goal: <b>${goal} ${unit}</b>\nThat's about <b>${pace} ${unit}/week</b> to finish in 100 days.\n\nDay 1 is where it happens. Keep moving. 🔥`,
      `🎯 የተቀመጠው ግብህ: <b>${goal} ${unit}</b>\nበ100 ቀናት ውስጥ ለማጠናቀቅ በሳምንት በግምት <b>${pace} ${unit}/ሳምንት</b> ማሳካት ይጠበቅብሃል።\n\nውጤት የሚመጣው ከዛሬው እርምጃ ነው፤ መስራትህን ቀጥል! 🔥`
    ),

  streaksReply: (lang, body) =>
    pick(
      lang,
      `<b>🔥 Top streaks</b>\n\n${body}\n\nChase the top. Log daily. 🏃`,
      `<b>🔥 ከፍተኛ የተከታታይ ስኬቶች (Top Streaks)</b>\n\n${body}\n\nወደፊት ለመመራት ትጋ፤ በየቀኑ እንቅስቃሴህን መዝግብ! 🏃`
    ),

  streaksEmpty: (lang) =>
    pick(
      lang,
      `No streaks yet.\n\nBe the first to log 2+ days in a row. 🔥`,
      `እስካሁን ምንም የተመዘገበ ተከታታይ ስኬት የለም።\n\nተከታታይ 2+ ቀናትን በመመዝገብ የመጀመሪያው ሁን! 🔥`
    ),

  // ── Check-in ───────────────────────────────────────
  checkinSuccess: (lang, distance, unit, total, goal) =>
    pick(
      lang,
      `✅ Logged <b>${distance} ${unit}</b>. 🏃\n\nTotal: <b>${total} ${unit}</b>\n🔥 <b>${pct(total, goal)}%</b> of your goal\n\nKeep the streak alive!`,
      `✅ <b>${distance} ${unit}</b> በስኬት ተመዝግቧል! 🏃\n\nጠቅላላ ስብስብ: <b>${total} ${unit}</b>\n🔥 ከግቡ <b>${pct(total, goal)}%</b> አሳክተሃል\n\nየተከታታይ ስኬትህን (Streak) አጠናክረህ ቀጥል!`
    ),

  checkinInvalid: (lang) =>
    pick(
      lang,
      `Usage: <code>/checkin 8.4</code>\n\nSend the distance you did today, e.g. <code>/checkin 8.4</code> or <code>/checkin 3</code>.`,
      `የአጠቃቀም መመሪያ: <code>/checkin 8.4</code>\n\nዛሬ ያከናወንከውን ርቀት/መጠን ያስገቡ፤ ለምሳሌ <code>/checkin 8.4</code> ወይም <code>/checkin 3</code>።`
    ),

  checkinClosed: (lang, date) =>
    pick(
      lang,
      `Logging opens on <b>${date}</b>.\n\nYour 100 hasn't started yet — get ready. 🔥`,
      `የእንቅስቃሴ ምዝገባ በ<b>${date}</b> ይከፈታል።\n\nየ100 ቀን ጉዞህ ገና አልተጀመረም — ዝግጅትህን አጠናክር! 🔥`
    ),

  checkinOutsideWindow: (lang, start, end) =>
    pick(
      lang,
      `Your check-in must fall inside the challenge window.\n\nLog activities dated between <b>${start}</b> and <b>${end}</b>.`,
      `የምታስገባው ቼክ-ኢን በውድድሩ የጊዜ ክልል ውስጥ መሆን አለበት።\n\nከ<b>${start}</b> እስከ <b>${end}</b> ባሉት ቀናት ውስጥ የተደረጉ እንቅስቃሴዎችን ብቻ መዝግብ።`
    ),

  // ── Language ───────────────────────────────────────
  languageSet: (lang) =>
    pick(lang, `Language set to English. 🇬🇧`, `ቋንቋ ወደ አማርኛ ተቀይሯል። 🇪🇹`),

  languageUsage: (lang) =>
    pick(lang, `Usage: /language en or /language am`, `አጠቃቀም: /language en ወይም /language am`),

  disconnected: (lang) =>
    pick(
      lang,
      `Your Telegram has been disconnected from THE 100.\n\nYou can reconnect anytime from your dashboard — /help for commands.`,
      `የቴሌግራም መለያህ ከTHE 100 ጋር ያለው ግንኙነት ተቋርጧል።\n\nበማንኛውም ጊዜ ከዳሽቦርድህ እንደገና ማገናኘት ትችላለህ — ትዕዛዞችን ለማየት /help ን ተጠቀም።`
    ),

  // ── Help / fallback ────────────────────────────────
  help: (lang) =>
    pick(
      lang,
      `<b>THE 100 commands</b>\n\n/status — your progress\n/day — your day\n/goal — your goal\n/checkin 8.4 — log an activity\n/streaks — top streaks\n/language en|am — switch language\n/help — commands\n\nYour 100. Your goal. Let's go. 🔥`,
      `<b>የTHE 100 የትዕዛዝ መመሪያዎች</b>\n\n/status — ያለህበት እድገት\n/day — ያለህበት ቀን\n/goal — የተቀመጠው ግብህ\n/checkin 8.4 — እንቅስቃሴ መዝግብ\n/streaks — ከፍተኛ ተከታታይ ስኬቶች\n/language en|am — ቋንቋ ቀይር\n/help — ትዕዛዞች\n\n100 ቀንህ። ታላቅ ግብህ። አሁኑኑ ጀምር! 🔥`
    ),

  unknown: (lang) =>
    pick(
      lang,
      `Hmm, I don't know that command yet.\n\nTry /help to see what I can do.`,
      `ይቅርታ፤ ይህንን ትዕዛዝ ማወቅ አልቻልኩም።\n\nማድረግ የምችለውን ለማየት /help ን ተጭነህ ተመልከት።`
    ),

  // ── Group broadcasts (bilingual — EN + AM) ─────────
  groupMilestone: (name, threshold, unit) =>
    `🔥 ${esc(name)} just hit <b>${threshold} ${unit}</b> — THE 100 CLUB!\n\nBig milestone. Give ${esc(name)} a cheer! 🎉\n\n🔥 ${esc(name)} <b>${threshold} ${unit}</b> በማሳካት ወደ THE 100 CLUB ተቀላቅሏል!\n\nታላቅ ስኬት ነው! ለ${esc(name)} የእንኳን ደስ አለህ ምስጋና አቅርቡለት! 🎉`,

  groupFinish: (name, goal, unit) =>
    `🏁 ${esc(name)} finished their 100!\n\n<b>${goal} ${unit}</b> in 100 days. Absolute legend. 🎉\n\n🏁 ${esc(name)} የ100 ቀን ጉዞውን በድል አጠናቋል!\n\nበ100 ቀናት ውስጥ <b>${goal} ${unit}</b> ማሳካት ችሏል። እውነተኛ ጀግና! 🎉`,

  groupJoin: (name) =>
    `👋 ${esc(name)} joined THE 100!\n\nWelcome to the crew — say hi! 🎉\n\n👋 ${esc(name)} THE 100ን ተቀላቅለዋል!\n\nእንኳን ወደ ቡድናችን በደህና መጡ — የሞቀ አቀባበል አድርጉላቸው! 🎉`,

  // Context-aware welcome: linked+goal, linked no goal, or not linked.
  groupWelcome: (ctx) => {
    const name = esc(ctx.name || 'friend');
    if (ctx.linked && ctx.goal) {
      const dayLine = ctx.day ? ` 📅 Day ${ctx.day}/100` : '';
      return (
        `🎉 Welcome ${name} to THE 100 — they're officially in!\n\n🎯 Goal: <b>${ctx.goal} ${ctx.unit}</b>${dayLine}\n\nGive them a cheer! 🔥\n\n` +
        `🎉 ${name} እንኳን ወደ THE 100 በደህና መጡ — በይፋ ተቀላቅለዋል!\n\n🎯 ግብ: <b>${ctx.goal} ${ctx.unit}</b>${dayLine}\n\nየሞቀ አቀባበልና ድጋፋችሁን ስጧቸው! 🔥`
      );
    }
    if (ctx.linked) {
      return (
        `👋 Welcome ${name} to THE 100!\n\nSet your goal in the app to begin your 100. Your spot is waiting. 🎯\n\n` +
        `👋 ${name} እንኳን ወደ THE 100 በደህና መጡ!\n\nየ100 ቀን ጉዞዎን ለመጀመር በመተግበሪያው ግብዎን ያስቀምጡ። ቦታዎ እየጠበቀዎት ነው። 🎯`
      );
    }
    return (
      `👋 Welcome ${name} to THE 100!\n\nLink your account in the app via <b>JOIN THE COMMUNITY</b> to begin. 🚀\n\n` +
      `👋 ${name} እንኳን ወደ THE 100 በደህና መጡ!\n\nለመጀመር በመተግበሪያው ውስጥ <b>JOIN THE COMMUNITY</b> የሚለውን በመጫን መለያዎን ያገናኙ። 🚀`
    );
  },

  groupDigest: (checked, milestones, finishers) =>
    `📊 Today in THE 100\n\n✅ ${checked} checked in\n🎯 ${milestones} milestones\n🏁 ${finishers} finishers\n\nOne goal. 100 days. Let's go. 🔥\n\n` +
    `📊 የዛሬው የTHE 100 ውሎ\n\n✅ ${checked} ተመዝግበዋል\n🎯 ${milestones} አዳዲስ ምዕራፎች\n🏁 ${finishers} አጠናቃቂዎች\n\nአንድ ግብ። 100 ቀናት። ወደፊት! 🔥`
};