function pick(lang, en, am) {
  return lang === 'am' ? am : en;
}

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
      `🎉 Welcome to <b>THE 100</b> — you're officially in!\n\n📅 Your 100 begins: <b>${start}</b>\n🎯 Goal: <b>${goal} ${unit}</b>\n⏱ Duration: 100 days\n\nYour quick toolkit:\n• /status — your progress\n• /checkin 8.4 — log a run\n• /streaks — community streaks\n\n👥 Join the community: ${groupLink}\n\nSmall steps every day. You've got this. 🔥`,
      `🎉 እንኳን ወደ <b>THE 100</b> በደህና መጣህ — በይፋ ገብተሃል!\n\n📅 100ህ የሚጀምርበት: <b>${start}</b>\n🎯 ግብህ: <b>${goal} ${unit}</b>\n⏱ የቆይታ: 100 ቀናት\n\nፈጣን መሳሪያዎችህ:\n• /status — እድገትህ\n• /checkin 8.4 — ሩጫ መዝግብ\n• /streaks — የማህበረሰቡ ቀጣይነቶች\n\n👥 ማህበረሰቡን ይቀላቀሉ: ${groupLink}\n\nበየቀኑ ትንንሽ እርምጃዎች። ትችላለህ። 🔥`
    ),

  welcomeNoToken: (lang, appUrl, groupLink) =>
    pick(
      lang,
      `Welcome to <b>THE 100</b>!\n\nTo link your account:\n1️⃣ Open the app: ${appUrl}\n2️⃣ Tap <b>JOIN THE COMMUNITY</b>\n3️⃣ Come back here and send /start\n\n👥 Join the community group: ${groupLink}\n\nOne goal. 100 days. Let's go. 🔥`,
      `እንኳን ወደ <b>THE 100</b> በደህና መጣህ!\n\nመለያህን ለማገናኘት:\n1️⃣ መተግበሪያውን ክፈት: ${appUrl}\n2️⃣ <b>JOIN THE COMMUNITY</b> ን ተጭን\n3️⃣ ወደዚህ ተመልሰህ /start ላክ\n\n👥 የማህበረሰቡን ቡድን ይቀላቀሉ: ${groupLink}\n\nአንድ ግብ። 100 ቀናት። እንሂድ። 🔥`
    ),

  invalidToken: (lang) =>
    pick(
      lang,
      `This link is invalid or expired.\n\nOpen your dashboard and generate a fresh <b>JOIN THE COMMUNITY</b> link.`,
      `ይህ ሊንክ የተሳሳተ ወይም ጊዜው ያለፈ ነው።\n\nመለያህን ከፍተህ አዲስ <b>JOIN THE COMMUNITY</b> ሊንክ አዘጋጅ።`
    ),

  alreadyLinked: (lang) =>
    pick(
      lang,
      `You're already linked to THE 100. 🎉\n\nTry /status for your progress, or /help for all commands.`,
      `ቀድሞውኑ ከTHE 100 ጋር ተገናኝተሃል። 🎉\n\n/status ን ለእድገትህ ሞክር፣ ወይም /help ለሁሉም ትዕዛዞች።`
    ),

  notLinked: (lang) =>
    pick(
      lang,
      `Your Telegram isn't linked yet.\n\nOpen your dashboard and tap <b>JOIN THE COMMUNITY</b> to get started.\n\nTry /help for commands.`,
      `Telegramህ እስካሁን አልተገናኘም።\n\nመለያህን ከፍተህ <b>JOIN THE COMMUNITY</b> ን ተጭነህ ጀምር።\n\n/help ን ሞክር።`
    ),

  noEnrollment: (lang) =>
    pick(
      lang,
      `You're linked, but haven't committed to a goal yet.\n\nOpen the app and choose your 100 — your spot is waiting. 🎯`,
      `ተገናኝተሃል ግን እስካሁን ግብ አልመረጥክም።\n\nመተግበሪያውን ከፍተህ 100ህን ምረጥ — ቦታህ እየጠበቀህ ነው። 🎯`
    ),

  // ── Password reset ─────────────────────────────────
  resetLink: (lang, url) =>
    pick(
      lang,
      `🔐 Password reset requested.\n\nOpen this link within 15 minutes to set a new password:\n${url}\n\nIf this wasn't you, you can safely ignore this message.`,
      `🔐 የይለፍ ቃል ማስተካከያ ተጠይቋል።\n\nበ15 ደቂቃ ውስጥ ይህን ሊንክ ከፍተህ አዲስ የይለፍ ቃል አዘጋጅ:\n${url}\n\nይህ እርስዎ ካልሆኑ ይህን መልእክት በደህና መተው ይችላሉ።`
    ),

  // ── Personal notifications ─────────────────────────
  commitment: (lang, goal, unit) =>
    pick(
      lang,
      `🎯 Your 100 starts now!\n\nGoal: <b>${goal} ${unit}</b> · Day 1 of 100\n\n• Log with /checkin 8.4\n• Watch your /status\n• Hit milestones to celebrate\n\nDay 1 starts today. Let's move. 🔥`,
      `🎯 100ህ አሁን ይጀምራል!\n\nግብህ: <b>${goal} ${unit}</b> · ቀን 1 ከ100\n\n• /checkin 8.4 በመጠቀም መዝግብ\n• /status ላይ እድገትህን ተመልከት\n• መለያ ነጥቦችን ደርሰህ አክብር\n\nቀን 1 ዛሬ ይጀምራል። እንንቀሳቀስ። 🔥`
    ),

  milestoneHit: (lang, threshold, unit) =>
    pick(
      lang,
      `🎉 Milestone! You just hit <b>${threshold} ${unit}</b>.\n\nThat's real progress — keep the momentum going. The next milestone is waiting. 🔥`,
      `🎉 መለያ ነጥብ! አሁን <b>${threshold} ${unit}</b> ደርሰሃል።\n\nይህ እውነተኛ እድገት ነው — ጉልበቱን ጠብቅ። ቀጣዩ መለያ ነጥብ እየጠበቀህ ነው። 🔥`
    ),

  weeklyCheckin: (lang, total, goal, unit) =>
    pick(
      lang,
      `🗓 How did your week go?\n\nYou're at <b>${total} / ${goal} ${unit}</b> (${pct(total, goal)}%).\n\nLog this week's activities to keep your streak alive. 🔥`,
      `🗓 ሳምንትህ እንዴት ነበር?\n\nበ<b>${total} / ${goal} ${unit}</b> (${pct(total, goal)}%) ላይ ነህ።\n\nቀጣይነትህን ለመጠበቅ የዚህን ሳምንት እንቅስቃሴዎች መዝግብ። 🔥`
    ),

  inactivity: (lang, days) =>
    pick(
      lang,
      `💤 Your 100 is waiting for you.\n\nIt's been ${days} day(s) since your last activity — one check-in is all it takes to get back in.\n\nSend /checkin 8.4 or open the app. You're still in this. 🔥`,
      `💤 100ህ እየጠበቀህ ነው።\n\nየመጨረሻው እንቅስቃሴህ ከ${days} ቀናት በፊት ነበር — አንድ ቼክ-ኢን ብቻ እንደገና ሊያስጀምርህ ይችላል።\n\n/checkin 8.4 ላክ ወይም መተግበሪያውን ክፈት። አሁንም በውስጡ ነህ። 🔥`
    ),

  finish: (lang, goal, unit) =>
    pick(
      lang,
      `🏁 <b>YOU DID IT.</b>\n\nYou finished what you started — <b>${goal} ${unit}</b> in 100 days.\n\nThat's THE 100. Go celebrate. 🎉`,
      `🏁 <b>ፈጽመሃል!</b>\n\nየጀመርከውን ጨርሰሃል — በ100 ቀናት ውስጥ <b>${goal} ${unit}</b>።\n\nይህ THE 100 ነው። ሂድና አክብር። 🎉`
    ),

  // ── Commands ───────────────────────────────────────
  statusReply: (lang, goal, total, unit, day) =>
    pick(
      lang,
      `📊 <b>THE 100</b>\n\n🎯 Goal: <b>${goal} ${unit}</b>\n🏃 Progress: <b>${total} ${unit}</b>\n📅 Day: <b>${day}/100</b>\n🔥 <b>${pct(total, goal)}%</b> there\n\nKeep moving — the streak is watching.`,
      `📊 <b>THE 100</b>\n\n🎯 ግብ: <b>${goal} ${unit}</b>\n🏃 እድገት: <b>${total} ${unit}</b>\n📅 ቀን: <b>${day}/100</b>\n🔥 <b>${pct(total, goal)}%</b> ደርሰሃል\n\nቀጥል — ቀጣይነቱ እያየህ ነው።`
    ),

  statusPreLaunch: (lang, goal, unit, days) =>
    pick(
      lang,
      `📊 <b>THE 100</b>\n\n🎯 Goal: <b>${goal} ${unit}</b>\n⏳ Starts in <b>${days}</b> day(s) — September 21.\n\nUse this time to get ready. Your 100 is coming. 🔥`,
      `📊 <b>THE 100</b>\n\n🎯 ግብ: <b>${goal} ${unit}</b>\n⏳ በ<b>${days}</b> ቀናት ይጀምራል — መስከረም 21።\n\nይህን ጊዜ ለመዘጋጀት ተጠቀም። 100ህ ይመጣል። 🔥`
    ),

  dayReply: (lang, day) =>
    pick(
      lang,
      `📅 <b>DAY ${day} / 100</b>\n\nOne day at a time. Log today's activity to keep it going. 🔥`,
      `📅 <b>ቀን ${day} / 100</b>\n\nአንድ ቀን በአንድ ጊዜ። የዛሬን እንቅስቃሴ መዝግበህ አቀጥል። 🔥`
    ),

  dayPreLaunch: (lang, days) =>
    pick(
      lang,
      `⏳ The 100 starts in <b>${days}</b> day(s).\n\nSeptember 21 is almost here — get ready. 🔥`,
      `⏳ THE 100 በ<b>${days}</b> ቀናት ይጀምራል።\n\nመስከረም 21 እየተቃረበ ነው — ተዘጋጅ። 🔥`
    ),

  goalReply: (lang, goal, unit, pace) =>
    pick(
      lang,
      `🎯 Your goal: <b>${goal} ${unit}</b>\nThat's about <b>${pace} ${unit}/week</b> to finish in 100 days.\n\nDay 1 is where it happens. Keep moving. 🔥`,
      `🎯 ግብህ: <b>${goal} ${unit}</b>\nበ100 ቀናት ውስጥ ለማጠናቀቅ በግምት <b>${pace} ${unit}/ሳምንት</b> ማለት ነው።\n\nቀን 1 የሚወሰንበት ነው። ቀጥል። 🔥`
    ),

  streaksReply: (lang, body) =>
    pick(lang, `<b>🔥 Top streaks</b>\n\n${body}\n\nChase the top. Log daily. 🏃`, `<b>🔥 ከፍተኛ ቀጣይነቶች</b>\n\n${body}\n\nለግንባር ቀደሚነት ትጋ፣ በየቀኑ መዝግብ። 🏃`),

  streaksEmpty: (lang) =>
    pick(lang, `No streaks yet.\n\nBe the first to log 2+ days in a row. 🔥`, `እስካሁን ቀጣይነት የለም።\n\n2+ ቀናት በተከታታይ በመዝገብ የመጀመሪያው ሁን። 🔥`),

  // ── Check-in ───────────────────────────────────────
  checkinSuccess: (lang, distance, unit, total, goal) =>
    pick(
      lang,
      `✅ Logged <b>${distance} ${unit}</b>. 🏃\n\nTotal: <b>${total} ${unit}</b>\n🔥 <b>${pct(total, goal)}%</b> of your goal\n\nKeep the streak alive!`,
      `✅ ተመዝግቧል <b>${distance} ${unit}</b>። 🏃\n\nጠቅላላ: <b>${total} ${unit}</b>\n🔥 ከግብህ <b>${pct(total, goal)}%</b>\n\nቀጣይነቱን ጠብቅ!`
    ),

  checkinInvalid: (lang) =>
    pick(
      lang,
      `Usage: <code>/checkin 8.4</code>\n\nSend the distance you did today, e.g. <code>/checkin 8.4</code> or <code>/checkin 3</code>.`,
      `አጠቃቀም: <code>/checkin 8.4</code>\n\nዛሬ የሰራኸውን ርቀት ላክ፣ ለምሳሌ <code>/checkin 8.4</code> ወይም <code>/checkin 3</code>።`
    ),

  checkinClosed: (lang, date) =>
    pick(
      lang,
      `Logging opens on <b>${date}</b>.\n\nYour 100 hasn't started yet — get ready. 🔥`,
      `መዝገብ የሚከፈተው <b>${date}</b> ነው።\n\n100ህ ገና አልተጀመረም — ተዘጋጅ። 🔥`
    ),

  checkinOutsideWindow: (lang, start, end) =>
    pick(
      lang,
      `Your check-in must fall inside the challenge window.\n\nLog activities dated between <b>${start}</b> and <b>${end}</b>.`,
      `ቼክ-ኢንህ በተፈታዊ ጊዜ ውስጥ መሆን አለበት።\n\nእንቅስቃሴዎችን ከ<b>${start}</b> እስከ <b>${end}</b> መካከል መዝግብ።`
    ),

  // ── Language ───────────────────────────────────────
  languageSet: (lang) =>
    pick(lang, `Language set to English. 🇬🇧`, `ቋንቋ ወደ አማርኛ ተቀይሯል። 🇪🇹`),

  languageUsage: (lang) =>
    pick(lang, `Usage: /language en or /language am`, `አጠቃቀም: /language en ወይም /language am`),

  // ── Help / fallback ────────────────────────────────
  help: (lang) =>
    pick(
      lang,
      `<b>THE 100 commands</b>\n\n/status — your progress\n/day — your day\n/goal — your goal\n/checkin 8.4 — log an activity\n/streaks — top streaks\n/language en|am — switch language\n/help — commands\n\nYour 100. Your goal. Let's go. 🔥`,
      `<b>የTHE 100 ትዕዛዞች</b>\n\n/status — እድገትህ\n/day — ቀንህ\n/goal — ግብህ\n/checkin 8.4 — እንቅስቃሴ መዝግብ\n/streaks — ከፍተኛ ቀጣይነቶች\n/language en|am — ቋንቋ ቀይር\n/help — ትዕዛዞች\n\n100ህ። ግብህ። እንሂድ። 🔥`
    ),

  unknown: (lang) => pick(lang, `Hmm, I don't know that command yet.\n\nTry /help to see what I can do.`, `እስካሁን ያንን ትዕዛዝ አላውቀውም።\n\n/help ን ተጭነህ ምን ማድረግ እንደምችል ተመልከት።`),

  // ── Group broadcasts (bilingual — EN + AM) ─────────
  groupMilestone: (name, threshold, unit) =>
    `🔥 ${esc(name)} just hit <b>${threshold} ${unit}</b> — THE 100 CLUB!\n\nBig milestone. Give ${esc(name)} a cheer! 🎉\n\n🔥 ${esc(name)} <b>${threshold} ${unit}</b> ደርሷል — THE 100 CLUB!\n\nትልቅ መለያ ነጥብ! ${esc(name)} ን አድንቁ! 🎉`,

  groupFinish: (name, goal, unit) =>
    `🏁 ${esc(name)} finished their 100!\n\n<b>${goal} ${unit}</b> in 100 days. Absolute legend. 🎉\n\n🏁 ${esc(name)} 100ውን አጠናቋል!\n\nበ100 ቀናት ውስጥ <b>${goal} ${unit}</b>። ታላቅ! 🎉`,

  groupJoin: (name) =>
    `👋 ${esc(name)} joined THE 100!\n\nWelcome to the crew — say hi! 🎉\n\n👋 ${esc(name)} THE 100 ተቀላቅለዋል!\n\nእንኳን ወደ ቡድኑ በደህና መጡ — ሰላም ይበሉ! 🎉`,

  // Context-aware welcome: linked+goal, linked no goal, or not linked.
  groupWelcome: (ctx) => {
    const name = esc(ctx.name || 'friend');
    if (ctx.linked && ctx.goal) {
      const dayLine = ctx.day ? ` 📅 Day ${ctx.day}/100` : '';
      return (
        `🎉 Welcome ${name} to THE 100 — they're officially in!\n\n🎯 Goal: <b>${ctx.goal} ${ctx.unit}</b>${dayLine}\n\nGive them a cheer! 🔥\n\n` +
        `🎉 እንኳን ${name} ወደ THE 100 በደህና መጡ — በይፋ ገብተዋል!\n\n🎯 ግብ: <b>${ctx.goal} ${ctx.unit}</b>${dayLine}\n\nአድንቁዋቸው! 🔥`
      );
    }
    if (ctx.linked) {
      return (
        `👋 Welcome ${name} to THE 100!\n\nSet your goal in the app to begin your 100. Your spot is waiting. 🎯\n\n` +
        `👋 እንኳን ${name} ወደ THE 100 በደህና መጡ!\n\nግብዎን በመተግበሪያው አዘጋጅተው 100ዎን ይጀምሩ። ቦታዎ እየጠበቀዎት ነው። 🎯`
      );
    }
    return (
      `👋 Welcome ${name} to THE 100!\n\nLink your account in the app via <b>JOIN THE COMMUNITY</b> to begin. 🚀\n\n` +
      `👋 እንኳን ${name} ወደ THE 100 በደህና መጡ!\n\nመለያዎን በመተግበሪያው በ<b>JOIN THE COMMUNITY</b> በማገናኘት ይጀምሩ። 🚀`
    );
  },

  groupDigest: (checked, milestones, finishers) =>
    `📊 Today in THE 100\n\n✅ ${checked} checked in\n🎯 ${milestones} milestones\n🏁 ${finishers} finishers\n\nOne goal. 100 days. Let's go. 🔥\n\n` +
    `📊 ዛሬ በTHE 100\n\n✅ ${checked} ቼክ-ኢን\n🎯 ${milestones} መለያ ነጥቦች\n🏁 ${finishers} አጠናቃቂዎች\n\nአንድ ግብ። 100 ቀናት። እንሂድ። 🔥`
};