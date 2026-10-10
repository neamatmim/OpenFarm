/**
 * English is the source: developers add keys here — or, for a word read only at a desk or in the portal, in
 * ./en-desk.ts, by its area (`DESK_AREAS` in ../catalog-areas.ts; a test holds each key to its file). These are the words
 * every screen may need, and the only ones a Shed Phone fetches before its first screen is drawn.
 */
export const enCore = {
  "app.name": "OpenFarm",
  "app.tagline": "The farm's records and its Playbook, in one place.",
  "language.bn": "বাংলা",
  "language.en": "English",
  "language.switch": "Change language",
  "language.loadFailed":
    "Could not download this language. Your current language is still available.",
  "common.dataUpdated": "Last updated {at}",
  "common.dataOffline": "Offline · {updated}",
  "common.dataRefreshFailed": "Could not refresh · {updated}",
  "common.dataRefreshing": "Refreshing · {updated}",
  "common.dataIncomplete": "Some data has not loaded · {updated}",
  "outbox.details": "Sync details",
  "outbox.herdNever": "The herd has not been downloaded yet",
  "owner.milkSoFar": "Recorded so far",
  "auth.openAccountHint":
    "With the address the owner or a manager invited, and the code they gave you.",
  "auth.formIncomplete": "Fill in every field first.",
  "auth.firstFarmTitle": "Set up the farm",
  "auth.firstFarmHint":
    "Open the first account. Whoever opens it becomes the farm's owner, and invites everybody else from inside.",
  "auth.firstFarmRow": "Setting up the farm? Open the first account",
  "auth.firstFarmRowHint":
    "Whoever opens the first account becomes the farm's owner.",
  "auth.signOutHint": "Leave this account on this browser.",
  "common.goToStart": "Go to the start",
  "common.notFoundHint":
    "The page may have moved, or the address was mistyped.",
  "common.errorHint":
    "Try again. If it keeps happening, tell the farm's owner.",
  "setup.standard.chooseOne": "Choose at least one list, or skip.",
  "auth.shedPhone": "Shed phone",
  "auth.shedPhoneHint":
    "Staff sign in with their PIN. A new phone is set up with the manager's code.",
  "auth.signIn": "Sign in",
  "auth.promise.title":
    "Every job on the farm, done the way the farm decided — and written down as it happens.",
  "auth.promise.playbook":
    "The Playbook turns the farm's procedures into each day's work, for the right person, at the right pen.",
  "auth.promise.record":
    "Every liter, dose and sale is the record: signed, corrected in the open, ready for an inspector.",
  "auth.promise.offline":
    "Works in the shed with no signal, and sends everything when the phone is back in range.",
  "auth.formHint": "Use the account the farm set up for you.",
  "auth.signOut": "Sign out",
  "auth.myAccount": "My account",
  "auth.welcomeBack": "Welcome back",
  "auth.createAccount": "Create account",
  /** Said on the sign-up form only. The farm opens accounts against an invite, so somebody nobody asked for
   *  is told here rather than after filling the whole form in. */
  "auth.signUpHint":
    "For somebody the farm has invited. Open the account with the address you were invited on, then enter the code you were given.",
  "auth.name": "Name",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.submitting": "Submitting…",
  "auth.signUp": "Sign up",
  "auth.needAccount": "Invited? Open your account",
  "auth.haveAccount": "Already have an account? Sign in",
  "auth.forgotPassword": "Forgot password?",
  "auth.forgotTitle": "Set a new password",
  "auth.forgotHint":
    "Ask the owner or the manager for a code, then choose a password of your own.",
  "auth.code": "Code",
  "auth.newPassword": "New password",
  "auth.passwordSet": "Password set — sign in with it",
  "auth.backToSignIn": "Back to sign in",
  "auth.signInSuccess": "Signed in",
  "auth.goToYourAddress": "Go to your address",
  "auth.wrongAddress":
    "This address is not yours to sign in at. Sign in at your own: {address}",
  "auth.noLongerHere":
    "You no longer work on this farm. Ask the owner if this is wrong.",
  "auth.notInvited":
    "The farm has not invited this address. Ask the owner to invite you, then open the account with the code you are given.",
  "auth.onlyTheOwnerFirst":
    "The farm is not set up yet, and only its owner's address may open the first account.",
  "auth.setupCodeWrong":
    "That is not the setup code. It is in the server's log, printed when the server first started: journalctl -u openfarm | grep 'setup code'.",
  "auth.setupCode": "Setup code",
  "auth.setupCodeHint": "From the server's log, printed when it first started.",
  "auth.ownerNotNamed":
    "The farm is not open yet. Whoever runs the server must first name the owner's address (OPENFARM_OWNER_EMAIL).",
  "price.col": "Price and cost",
  "price.cost": "Cost {cost}",
  "price.breakEven": "pays for itself at {perKg} a kg",
  "price.margin": "{low} to {high} over cost",
  "price.costShort": "some costs have no price yet",
  "price.born": "born here: no purchase in the cost",
  "price.noPrice": "No price a kg set",
  "price.col.estimate": "Might fetch",
  "price.col.cost": "Cost so far",
  "keep.title": "Keep or sell",
  "keep.hint":
    "Whether keeping an animal {ahead, plural, one {# more day} other {# more days}} pays: feed, medicine, vet visits and share of the herd costs over the last {days, plural, one {# day} other {# days}}, over the kilos being put on now, against the price a kg. What the animal has cost already is spent either way, so it has no say here. It does not know the price will change at Eid.",
  "keep.hintUnset":
    "Whether keeping an animal a while longer pays: recent feed, medicine, vet visits and share of the herd costs, over the kilos being put on now, against the price a kg. What the animal has cost already is spent either way, so it has no say here. It does not know the price will change at Eid.",
  "keep.pays": "Keeping pays",
  "keep.close": "Depends on the price",
  "keep.costsMore": "Costs more to keep",
  "keep.over":
    "Next {days, plural, one {# day} other {# days}}: {over} over keep",
  "keep.ahead": "{gain} for {keep} of keep",
  "keep.perKg": "a kg costs {perKg} to put on",
  "keep.notGaining":
    "Not gaining: {keep} for {days, plural, one {# day} other {# days}} of keep",
  "keep.short": "some feed or medicine has no price yet",
  "keep.tooNew": "Keep or sell: too soon to tell",
  "keep.notFed": "Keep or sell: no feeding recorded lately",
  "keep.noRate": "Keep or sell: weigh again to tell",
  "keep.all": "Keep or sell: all",
  "cull.subtitle":
    "Cows the farm names for you to think about letting go, and why. Nothing here is decided: culling one is still a sale to a butcher, or a death recorded.",
  "cull.reason.milk_short": "Milk under keep",
  "cull.reason.open_long": "Empty too long",
  "cull.reason.repeat_breeder": "Will not settle",
  "cull.named": "Might be culled",
  "cull.namedHint": "Cows with at least one reason",
  "cull.milkHint":
    "Milk over the last {days, plural, one {# day} other {# days}} fetched less than her keep",
  "cull.milkHintUnset": "Recent milk fetched less than her keep",
  "cull.openHint":
    "Not in calf {days, plural, one {# day} other {# days}} after calving, or dry and not in calf",
  "cull.repeatHint": "Served heat after heat without settling",
  "cull.openHintUnset":
    "Not in calf long after calving, or dry and not in calf",
  "cull.all": "All cows",
  "cull.col.reasons": "Reasons",
  "cull.col.milk": "Milk against keep",
  "cull.col.calving": "Calving",
  "cull.milk": "Milk {worth} · keep {keep}",
  "cull.over": "{over} over keep in {days, plural, one {# day} other {# days}}",
  "cull.rate": "{liters} L a day · a liter costs {cost}",
  "cull.noneToBulk": "no milk to bulk",
  "cull.dry": "Dry: no milk",
  "cull.tooSoon": "Too soon after calving to weigh",
  "cull.notFed": "No feeding recorded lately",
  "cull.noPrice": "No milk sold lately to price it",
  "cull.inCalf": "In calf, due {day}",
  "cull.sinceCalving":
    "{days, plural, one {# day} other {# days}} since calving",
  "cull.notInCalf": "Not in calf",
  "cull.price":
    "Milk is priced at {price} a liter: what the farm's dispatches fetched over the last {days, plural, one {# day} other {# days}}.",
  "cull.unpriced":
    "No milk sold in the last {days, plural, one {# day} other {# days}}, so no cow's milk can be set against her keep.",
  "cull.unpricedUnset":
    "No milk sold lately, so no cow's milk can be set against her keep.",
  "cull.none": "No cow gives a reason to cull",
  "cull.noneHint":
    "Every cow in milk pays for her keep, every one that should be is in calf, and none is failing to settle.",
  "cull.noneInFilter": "No cow in this list",
  "cull.hint":
    "For you alone, and never a decision: her recent milk and keep, whether she is in calf, and whether she has settled.",
  "market.title": "Market price",
  "market.hint":
    "What a kilo of live weight is fetching, as you judge it. The farm's own animals are priced at it; a venture's animals at their venture's own prices. Yours to read: the manager and investors do not see prices.",
  "market.recent":
    "Your sales to buyers in the last {days, plural, one {# day} other {# days}} fetched {perKg} a kg, over {animals, plural, one {# animal} other {# animals}}.",
  "market.noRecent":
    "No sales to a buyer in the last {days, plural, one {# day} other {# days}}.",
  "market.none": "Not set: the farm's own animals have no estimated price yet.",
  "market.line": "{low} to {high} a kg, set on {day}",
  "market.set": "Set market price",
  "market.change": "Change market price",
  "market.low": "Low ({currencySign} a kg, live)",
  "market.high": "High ({currencySign} a kg, live)",
  "market.saved": "The market price is saved",
  "projection.title": "Projected profit",
  "projection.hint":
    "Your own estimate, worked from the Venture's plan: its sale prices, and what it has still to buy. Investors see it only once you show projections on the Investors page, and it is never printed on a paper.",
  "projection.none": "No plan yet. Write one above and this is worked from it.",
  "projection.lowAboveHigh": "The low price is above the high one",
  "projection.range": "{low} to {high}",
  "projection.profit": "Profit",
  "projection.perUnit": "A Unit",
  "projection.kgAtSale": "Weight at sale",
  "projection.prices": "Sale price a kg",
  "projection.charged": "Costs counted",
  "projection.realized": "Already sold for",
  "projection.fromPlan": "Worked from plan version {version}, saved on {day}",
  "projection.lossAtLow":
    "At the low price this is a loss, and a loss comes off the Investors' capital.",
  "projection.switch.title": "Projections for Investors",
  "payInNote.switch.title": "Pay-in notes from investors",
  "payInNote.switch.show": "Turn on",
  "payInNote.switch.hide": "Turn off",
  "payInNote.switch.shownHint":
    "An investor may tell you in the portal that they sent money towards their agreement. You check the venture account and record it, or answer not found. No money moves through the portal.",
  "payInNote.switch.hiddenHint":
    "Off. Turn it on only once the lawyer and the Shariah scholar have seen it — their approval was of a portal that only says where to pay.",
  "payInNote.switch.confirmTitle": "Turn on pay-in notes?",
  "payInNote.switch.confirmWhy":
    "Have the lawyer and the Shariah scholar seen it? Once on, every invited investor who still owes on an agreement may tell you they sent money, and you are told at once.",
  "payInNote.switch.shownDone": "Pay-in notes are on",
  "payInNote.switch.hiddenDone": "Pay-in notes are off",
  "projection.switch.shown": "Shown",
  "projection.switch.hidden": "Hidden",
  "projection.switch.show": "Show projections",
  "projection.switch.hide": "Hide projections",
  "projection.switch.shownHint":
    "Invited Investors see each Venture's projected profit, as an estimate, on their Ventures and on the Ventures offered to them.",
  "projection.switch.hiddenHint":
    "Investors see no projections. You can read them in the Portal Preview before you show them.",
  "projection.switch.confirmTitle": "Show projections to Investors?",
  "projection.switch.confirmWhy":
    "Every invited Investor will see what each Venture might make at your sale prices, labeled as an estimate. The farm's lawyer and Shariah scholar approved the portal without projections: show their wording to them first.",
  "projection.switch.shownDone": "Investors now see projections",
  "projection.switch.hiddenDone": "Projections are hidden from Investors",
  "auth.signUpSuccess": "Account created",
  "auth.invalidEmail":
    "Enter an email address in the right form, like name@example.com",
  "auth.showPassword": "Show password",
  "auth.hidePassword": "Hide password",
  "auth.signUpRefused": "The account could not be opened",
  "auth.accountSlowed":
    "Too many wrong passwords for this account. Wait a minute and try again.",
  "auth.refused": "Could not sign you in",
  "auth.wrongEmailOrPassword":
    "That email and password do not go together: check both",
  "auth.wrongPassword": "That is not your present password",
  "auth.passwordTooLong": "That password is too long",
  "auth.alreadyHasAccount": "Somebody already has an account with that email",
  "auth.signInAgainFirst":
    "Sign in again first: it has been a while since you did",
  "auth.passwordTooShort":
    "Password must be at least {min, plural, one {# character} other {# characters}}",
  "auth.passwordTooCommon":
    "That password is one of the most common, and anybody could guess it. Choose another.",
  "auth.nameTooShort":
    "Name must be at least {min, plural, one {# character} other {# characters}}",
  "nav.people": "People and access",
  "people.search": "Search by name or email",
  "people.noneFound": "Nobody by that name",
  "people.standing.working": "Working",
  "people.standing.gone": "No longer here",
  "people.standing.waitingForTheOwner": "Waiting for the owner",
  "people.standing.waitingToSignUp": "Waiting to sign up",
  "people.pensHeld": "{count, plural, one {# pen} other {# pens}}",
  "people.col.pens": "Pens",
  "people.signedInOn": "Signed in on",
  "people.signedInNowhere": "Not signed in anywhere",
  "people.signedInSince": "Since {date}, last seen {seen}",
  "people.signOut": "Sign out",
  "people.signedOut": "Signed out",
  "people.passwordCode": "Forgotten password",
  "people.passwordCodeWhy":
    "Hand them this code. They enter it on the sign-in screen and choose their own password — the farm never sets one for them.",
  "people.newPasswordCode": "New password code",
  "people.name": "Name",
  "people.correctName": "Correct the name",
  "people.email": "Email",
  "people.roles": "Roles",
  "people.status": "Status",
  "people.active": "Active",
  "people.disabled": "Disabled",
  "people.disable": "Remove access",
  "people.enable": "Restore access",
  "people.disableTitle": "Remove {name}'s access?",
  "people.disableWhy":
    "They are signed out at once and cannot sign in again until access is restored. Their records stay.",
  "people.saveRoles": "Save roles",
  "people.approve": "Approve",
  "people.invite": "Invite a person",
  "people.inviteSend": "Send invite",
  "people.shedPhoneOnly":
    "Works only on the shed phones, with a PIN — no email",
  "people.shedPhoneOnlyHint":
    "For someone with no email or phone of their own. They get no login; once given pens and a PIN, they work on the shed phones.",
  "people.shedPhoneOnlyAdd": "Add",
  "people.shedPhoneOnlyAdded": "Added — now give them their pens and a PIN",
  "people.shedPhoneOnlyWaiting":
    "Added — they can start once the owner approves",
  "people.shedPhoneOnlyShown": "Shed phone only",
  "people.inviteSent": "Invite recorded",
  "people.handOverTitle": "Give {name} this code",
  "people.handOverHow":
    "They sign up with {email} and enter the code. It works once, and only for that email. It is shown only now.",
  "people.newCode": "New code",
  "people.withdrawInvite": "Withdraw invite",
  "people.inviteWithdrawn": "Invite withdrawn",
  "people.standing.codeLapsed": "Code lapsed — give a new one",
  "people.kpi.toApprove": "Waiting for approval",
  "people.subtitle":
    "Who works on the farm, what each may do, and who is waiting to join.",
  "people.filter.anyRole": "Any role",
  "people.filter.anyStatus": "Any status",
  "people.filter.clear": "Clear filters",
  "people.inviteWhy":
    "They get a code to sign up with. An invite from the owner works at once; one from a manager waits for the owner.",
  "people.rowActions": "{name} — more actions",
  "people.copy": "Copy the code",
  "people.copied": "Copied",
  "people.codeOnce":
    "Shown only this once. Copy it or write it down before closing.",
  "people.codeDone": "Done",
  "people.tab.access": "Access & work",
  "people.tab.signIns": "Sign-ins",
  "people.tab.training": "Training",
  "people.change": "Change",
  "people.rolesWhy": "What they may see and do on the farm.",
  "people.ownOwnerRoleStays":
    "Your own owner role stays: another owner takes it off, so the farm is never left with nobody to run it.",
  "people.pensWhy": "Their daily work comes from these pens.",
  "people.pinWhy":
    "Four digits to switch to themselves on a shed phone. It is never shown again.",
  "people.enableWhy": "They can sign in again with their own password.",
  "people.trainingNone": "Not trained on anything in the Playbook yet",
  "people.signInsWhy":
    "Browsers and phones signed in as them. Sign one out if it is lost or shared. Shed phones are kept apart.",
  "people.unknownDevice": "Unknown device",
  "people.col.device": "Device",
  "people.col.lastSeen": "Last seen",
  "people.col.since": "Signed in",
  "people.col.from": "Network address",
  "join.title": "Join the farm",
  "join.subtitle":
    "You were given a code by whoever invited you. Enter it to start work.",
  "join.code": "Invitation code",
  "join.submit": "Join",
  "join.joined": "Welcome — you can start work",
  "join.wrongEmail":
    "Signed in as {email}. The code only works for the email you were invited under.",
  "people.rolesSaved": "Roles saved",
  "people.approved": "Approved",
  "people.noPending": "No invites waiting",
  "role.owner": "Owner",
  "role.manager": "Manager",
  "role.staff": "Barn staff",
  "role.vet": "Vet",
  "setup.title": "Set up the farm",
  "setup.intro": "Name the farm. You become its owner.",
  "setup.farmName": "Farm name",
  "setup.create": "Create the farm",
  "setup.done": "The farm is ready",
  "setup.goOn": "Go to the farm",
  "setup.standard.title": "Start with the standard lists",
  "setup.standard.intro":
    "Tick what the farm starts with instead of an empty store. Anything it already has by name is left as it is, and all of it can be changed later.",
  "setup.standard.feed": "Feed items",
  "setup.standard.feedHint":
    "{count, plural, one {# common feed} other {# common feeds}}, in kg — no prices, no stock",
  "setup.standard.rations": "Rations",
  "setup.standard.rationsHint":
    "{count, plural, one {# ration} other {# rations}}, not yet fed to any pen. They bring the feed items they name.",
  "setup.standard.health": "Medicine list and notifiable diseases",
  "setup.standard.healthHint":
    "{drugs, plural, one {# medicine} other {# medicines}} for the vet to finish with their withdrawal days, and the {diseases, plural, one {# disease} other {# diseases}} the DLS must be told of",
  "setup.standard.playbook":
    "The standard procedures wait in the Playbook, for you to read and publish one at a time.",
  "setup.standard.start": "Start with these",
  "setup.standard.skip": "Start empty",
  "setup.standard.done": "The farm has its standard lists",
  "setup.standard.feedRetired":
    "The standard rations feed {feed}, which this farm has retired: restore it on the Feed items tab first",
  "setup.standard.bundlesByTheHead":
    "The standard rations give {feed} by body weight, and this farm counts it in bundles: start without the rations and write them by hand",
  "common.error": "Something went wrong",
  "common.loading": "Loading…",
  "common.loadFailed": "Could not load this — check the connection",
  "params.alerts": "Alerts and quiet hours",
  "params.records": "Records",
  "params.pinAutoLock": "Shed phone locks after",
  "animals.groupTick": "Choose {tag} to move",
  "animals.groupChosen":
    "{count, plural, one {# animal} other {# animals}} chosen",
  "animals.groupMove": "Move {count, plural, one {# animal} other {# animals}}",
  "animals.groupMoved":
    "{count, plural, one {# animal} other {# animals}} moved",
  "animals.groupQueued":
    "{count, plural, one {# move} other {# moves}} held on this phone until it has signal",
  "animals.groupAlreadyThere":
    "{count, plural, one {# animal was} other {# animals were}} already in that pen",
  "animals.groupRefused":
    "{count, plural, one {# animal} other {# animals}} could not be moved",
  "params.breeding": "Breeding calendar",
  "params.fatteningAndPapers": "Fattening and papers",
  "params.alertsHint":
    "When the day's digest goes out, the quiet hours, and how long before a lot expires it is warned of.",
  "params.recordsHint":
    "How far a reading may drift before it is flagged, and how long barn staff may correct their own records.",
  "params.checks": "Checks on the manager",
  "params.range": "From {min} to {max}",
  "params.notAWholeFigure": "Write a whole number",
  "params.checksHint":
    "How long work may run late before you are told, how long the manager may correct records, and what spending waits for your approval. Yours to set: you are told when the manager changes any other setting.",
  "params.breedingHint":
    "The days the Playbook times breeding work from, the same for every cow.",
  "params.fatteningAndPapersHint":
    "The weight a fattening animal is aimed at; how many days of weigh-ins her gain is judged over against her ration, and at what share for a deshi animal or a female; and how early the farm is warned before its registration runs out.",
  "params.digestTimes": "Digest times (comma separated)",
  "params.quietFrom": "Quiet from",
  "params.quietUntil": "Quiet until",
  "params.escalation": "Tell the owner when work is overdue after",
  "params.milkTolerance": "Milk tank tolerance",
  "params.feedTolerance": "Feed stock tolerance",
  "params.staffCorrection": "Staff may correct for",
  "params.managerCorrection": "Manager may correct for",
  "params.keepAndCull": "Keep, sell or cull",
  "params.keepAndCullHint":
    "How far back an animal's keep is read for keep-or-sell and the culling list, how far ahead keeping her is weighed, and what puts a dairy cow on that list. Yours alone to set, as the two are yours alone to read.",
  "params.monthlyCosts": "Monthly costs",
  "params.monthlyCostsHint":
    "From this day of the month, each category marked as paid every month with nothing entered that month is shown to the manager and to you, and so is anybody paid a wage last month and not this month.",
  "params.returns": "Returns",
  "params.returnsHint":
    "What the Returns page puts a year. Money tied up fewer days than this, on average, shows its share and its days but no rate a year, because a few weeks scaled to a year is a figure nobody earned. Yours alone to set, as the page is yours alone to read.",
  "params.returnYearFloorDays":
    "Put a return a year once money was tied up at least",
  "params.keepReadDays": "Read an animal's keep over the last",
  "params.keepAheadDays": "Weigh keeping an animal over the next",
  "params.keepNeedsDays": "Judge an animal's keep once she has been here",
  "params.keepRateGapDays": "Trust a gain between weigh-ins at least",
  "params.cullOpenDays": "Empty too long after calving",
  "params.monthlyCostsFromDay": "From this day of the month",
  "params.receivable": "Receivables",
  "params.receivableHint":
    "Money a buyer still owes with no day promised — a milk buyer who pays on a round — is overdue after this many days.",
  "params.receivableDays": "Overdue with no promised day after",
  "params.cullMilkAfterDays": "Weigh milk against keep from, after calving",
  "params.cullCalfMilkDays": "A cow's milk is her calf's for the first",
  "params.cullMilkPriceDays": "Price milk from dispatches of the last",
  "params.ventures": "Ventures",
  "params.venturesHint":
    "What a venture is planned by when you open one: the least it is worth starting on, how much of its capital keeps the animals rather than buys them, and how long it keeps selling after its window closes.",
  "params.ventureFloor": "A venture\u2019s floor, of what it is after",
  "params.ventureRunning":
    "Kept back to feed them, of a venture\u2019s capital",
  "params.ventureInvestors":
    "The investors’ share of the profit, where a new agreement starts",
  "params.windUp": "Selling after the window closes",
  "params.priceWeighIn":
    "How old a weighing may be to price an internal sale or the buy-back on",
  "params.adjustmentThreshold": "Worth adjusting a settlement over",
  "params.investorCap": "Investors at a time, at most",
  "params.investorWarnAt": "Warn from this many investors",
  "params.runningBudgetWarn":
    "Warn when a venture has less than this to feed with",
  "params.people": "people",
  /** The Ventures the Manager is looking after cattle for. Budgets, spend and warnings only — whose
   *  money it is never reaches this screen. */
  "venturesAtWork.title": "Ventures",
  "venturesAtWork.hint":
    "The ventures whose cattle you are looking after, and what each has left to feed them with.",
  "venturesAtWork.feedingLeft": "{left} left to feed with",
  "venturesAtWork.spent": "{spent} spent",
  "venturesAtWork.standing": "{standing} cattle standing",
  "venturesAtWork.sellingBy": "selling by {day}",
  "venturesAtWork.runningLow": "Feeding money is low",
  /** What a Venture wants the Owner for, on her own page. A stale bank month and one that disagreed
   *  are said apart: one needs the statement read again, the other needs explaining. */
  "ventureTrouble.title": "Ventures needing you",
  "ventureTrouble.decisionDue":
    "Decide by {day}, and still {currencySign}{short} short of the floor: bring in the rest, or call it off",
  "ventureTrouble.runningBudgetLow":
    "Running low on feeding money — {currencySign}{left} left",
  "ventureTrouble.pastWindUp":
    "The wind-up period is over with {standing} cattle still unsold",
  "ventureTrouble.bankStale":
    "The bank needs reading again for {months} — the farm changed its mind about those months",
  "ventureTrouble.bankDisagrees":
    "The bank did not agree for {months} — say what you found out",
  /** "Investor statements" in full, and the third paper named for what it is: a bare "Statements" or
   *  "Settlement" would collide with the bank's statement a Bank Check reads and with the Venture's own
   *  Settlement, whose button sits on the same card. */
  "statements.title": "Investor statements",
  "statements.for": "{name}'s papers",
  "statements.joining": "Joining letter",
  "statements.progress": "Progress",
  "statements.settlement": "Settlement statement",
  "statements.agreementCopy": "Print a copy of the Agreement",
  "statements.signedPaper": "The signed paper's photo",
  "statements.noPaperPhoto": "No photo of the signed paper kept yet",
  "statements.copyTitle": "Copy of the Agreement",
  "statements.copyHint":
    "The Agreement as it was signed — marked as a copy on every page, so it is never signed again as an original.",
  "statements.paperTitle": "The signed Agreement paper",
  "statements.paperHint":
    "The photo of the stamped, signed original, as the farm kept it.",
  "statements.download": "Download the photo",
  "statements.photoOf": "The animal tagged {tag}",
  "statements.noCapitalYet":
    "No capital has arrived against that agreement yet, so there is nothing to acknowledge",
  "statements.capitalReturned":
    "That agreement's capital has been refunded, so the Farm holds none of it",
  "statements.notSettledYet":
    "That Venture's Settlement has not been approved yet",
  "statements.noSuchAgreement": "No such agreement on this farm",
  "statements.farmNotRegistered":
    "Write the farm's DLS registration number down first — every paper carries it",
  "farmCapital.theFarm": "The farm (its own capital)",
  "farmCapital.ownCapital": "Own capital",
  "farmCapital.take": "The farm takes units",
  "farmCapital.takeHint":
    "The farm puts its own money into {venture}, at the same unit price and on the same terms as everyone. It shares profit and loss on that money as any investor does, and every investor's agreement names its units before they sign.",
  "farmCapital.units": "The farm's units",
  "farmCapital.unitsHint": "At most half the venture's units: {most}",
  "farmCapital.splitIs":
    "On the farm's split: investors {investors}%, the farm {farm}%",
  "farmCapital.taken": "The farm's units are recorded",
  "farmCapital.refused.farmHasUnitsAlready":
    "The farm holds units of this venture already",
  "farmCapital.refused.investorsSignedAlready":
    "An investor has signed already. The farm takes its units before anybody signs, so all sign knowing",
  "farmCapital.refused.offerStanding":
    "An agreement offered in the app is waiting, laid out without the farm's units. Withdraw it first",
  "farmCapital.refused.paperLaidOut":
    "A paper has already been printed for an investor to sign without the farm's units. The farm takes its units before any is",
  "farmCapital.refused.wordingTellsNothing":
    "The investment agreement in force has no clause telling investors of the farm's own units. Publish one first",
  "farmCapital.refused.overHalf":
    "The farm may hold at most half of a venture's units",
  "farmCapital.refused.unitsGone":
    "Not that many units of this venture are left",
  "photo.added": "Photo added",
  "photo.none": "No photo yet",
  "photo.tooLarge":
    "That photo is too large to send. Take it again, or choose a smaller one.",
  "photo.notRead":
    "That photo could not be read. Take it again, or choose another.",
  "byHand.receiptTake": "Photograph the receipt",
  "renewal.certificateTake": "Photograph the certificate",
  "refusal.settlementApproved":
    "A settlement has been approved on these figures: raise a settlement adjustment instead",
  "refusal.madeGoodNotPriced":
    "She was made good at what she had cost the venture: there is no rate to put right",
  "refusal.pricedFromThisWeighing":
    "A price was struck from this weighing: put the sale right instead",
  "refusal.settlementFigure":
    "That is the settlement's own figure: put its day or reference right, never its amount",
  "picker.findAnimal": "Type a tag or a pen to find her",
  "picker.noMatch": "Nothing matches what you typed",
  "money.purseWas": "{venture}'s money",
  "refusal.keepNeededLongerThanRead":
    "An animal's keep is judged within the days it is read over: {readDays, plural, one {# day} other {# days}} at the most. Change the two together.",
  "refusal.milkWeighedTooSoon":
    "A cow's milk is weighed only past her calf's days and then the days her keep is read over: {soonestDays, plural, one {# day} other {# days}} at the soonest. Change them together.",
  "refusal.capitalOverCattlePart":
    "That is more than this agreement's cattle money: the rest comes by the month once buying starts",
  "refusal.cattleMoneyShort":
    "Some signed investors' cattle money has still to come: buying waits on all of it",
  "refusal.capitalOverUnits":
    "That is more than this agreement's units are worth",
  "refusal.refundNotItsMoney":
    "That refund names money this venture never took",
  "refusal.wageIsTheFarms":
    "A wage is the farm's own — the farm provides the people",
  "refusal.venturePaidInFull":
    "A venture's animal leaves paid in full — its investors' money is never lent to a buyer",
  "refusal.paidMoreThanPrice": "That is more than it came to",
  "refusal.receivableNeedsAPromise":
    "Write the day he promised to pay the rest by",
  "refusal.promiseBeforeItLeft":
    "He cannot have promised to pay by a day before it left",
  "refusal.paidMoreThanOwed":
    "He owes {currencySign}{owingMoney}; say in a note why he paid more",
  "refusal.noSuchBuyer": "The farm has never sold to anybody by that name",
  "refusal.aBullCalfIsNoHeifer":
    "A bull calf does not stay as a heifer — choose his fattening pen",
  "refusal.owedBelowWrittenOff":
    "{currencySign}{writtenOffMoney} is written off on it: lower the write-off first, then put this right",
  "refusal.owedBelowPaid":
    "His payments have already cleared {currencySign}{paidMoney} of it: put the payment right instead",
  "refusal.paidOnIt":
    "He has paid on it, or some was written off: put those right first",
  "refusal.sheIsBuiltOn":
    "Something has been written about her since she came — a move, a weighing, a dose: she is a real animal now",
  "refusal.voidHerIntake": "She was bought in: void her intake instead",
  "refusal.onlyCapitalIsVoided":
    "Only a capital payment written twice is voided; this money moved",
  "refusal.confirmedFromANote":
    "This payment was confirmed from the investor's own pay-in note: void the other one",
  "refusal.capitalReferenceTaken":
    "This venture has already taken capital under that reference",
  "correct.voidWhy": "Entered twice, or it never happened",
  "correct.voidIt": "Void it: it comes off the farm's books, with its money",
  "correct.voidAnimal": "Void her: written down twice, or she never came",
  "correct.voidCapital": "Void this payment: written twice",
  "refusal.paidOnByThisBuyer":
    "He has paid on it, or some was written off: put those right before naming another buyer",
  "refusal.serviceOfACalf":
    "A calf is not served: she is months from her first service",
  "refusal.pricedFromTheFuture":
    "Her price counts from a day that has come: today at the latest",
  "refusal.workAboutAnotherAnimal":
    "This work is about another animal: record it against her",
  "refusal.skipReasonNotOffered":
    "That is not one of this step's reasons to skip: choose one from the list",
  "refusal.doseNotDueYet":
    "This dose is not due yet. Give the dose before it first, or wait until nearer its time",
  "refusal.courseStopped": "The vet has already stopped this course",
  "refusal.countedTwice": "Each medicine is counted once in a count",
  "refusal.notShorter":
    "A withdrawal can only be made shorter. Choose a day and time before the one it stands at",
  "refusal.noWithdrawalDays":
    "The vet has written no withdrawal days for this medicine, so it cannot be given yet",
  "refusal.observationCorrected":
    "That sighting was corrected since this list was opened. Answer the one in its place",
  "refusal.feedOnARation":
    "A ration a pen is on still feeds it ({ration}). Change that ration first",
  "refusal.feedInTheStore":
    "The store still holds {left} of it. Count it to nothing at the store count, then retire it",
  "refusal.penHoldsAnimals":
    "Animals stand in this pen. Move them out before retiring it",
  "refusal.penOnARation":
    "This pen is on a ration. Take it off the ration before retiring it",
  "refusal.penIsQuarantine":
    "This is a quarantine pen. Unmark it before retiring it",
  "refusal.penRetired":
    "That pen is retired. Bring it back on the sheds page first",
  "refusal.shedHasPens":
    "Pens in this shed are still in use. Retire each of them first",
  "refusal.shedRetired":
    "That shed is retired. Bring it back on the sheds page first",
  "refusal.categoryIsStandard":
    "A standard category keeps its name: the farm's own records book under it",
  "refusal.registrationBackwards":
    "The registration cannot run out before the day it was issued. Check the year on both dates",
  "refusal.arrivedBeforeTheTrip":
    "She can't have come home before the outing that brought her went. Check the day",
  "refusal.wentInTheFuture":
    "A lorry can't have gone on a day that hasn't come yet",
  "refusal.floatStillOut":
    "The livestock market money for {wentTo} is still out: count it home before buying closes",
  "refusal.beforeSheWasHere":
    "She wasn't here yet then, or was moved after that time. Check the day and time",
  "refusal.bornInTheFuture": "A birth date can't be in the future",
  "refusal.correctTheStep":
    "That was given or seen on a piece of work: put it right on its step",
  "refusal.alreadyWithdrawn": "That has already been withdrawn",
  "refusal.notWrittenOff": "She is not written off as lost",
  "refusal.capitalTakenOnIt":
    "Capital has been taken on this agreement: what it says is what the money rests on",
  "refusal.sexRestsOnBreeding":
    "Her breeding, a calving or a calf of hers rests on what she is: her sex stays",
  "refusal.notHerDam": "Her dam is a cow of this farm's: give her tag",
  "refusal.prescribedForIt":
    "A course was prescribed for it: stop the course and put its doses right first",
  "refusal.herDeathNamesIt":
    "Her death is put down to it: put her death right first",
  "refusal.reportDelivered":
    "Its report has reached the office: a letter that went, went",
  "refusal.adjustmentNotClosed": "That adjustment is not paid or waived",
  "refusal.laterAdjustmentRestsOnIt":
    "A later adjustment was worked out from this one: open that one first",
  "refusal.countedSince":
    "A cash count of that hand since stands on it: put the count right first",
  "refusal.handoverOfAnOuting":
    "That cash went with an outing or into a venture: put it right there",
  "refusal.floatNotCounted": "That float has not been counted",
  "refusal.notExcused": "That dose was not excused",
  "refusal.releasedOnIt":
    "He has been released on it: give the dose in the herd",
  "refusal.notOnTheFarm":
    "The farm does not have that record: it has not arrived yet from a phone, or was taken away. Open the page again in a moment",
  "refusal.recordedByALeaver":
    "Recorded under somebody who no longer works on this farm: give it back to them, or write it again yourself",
  "refusal.alreadySold": "She has already been sold",
  "refusal.exitNeedsARecord":
    "An animal leaves the herd by the record of how she went — a sale, a death — not by a change of state",
  "refusal.meatWithdrawal": "She is still inside her meat withdrawal",
  "refusal.noSuchAnimal": "That animal is no longer here to show",
  "refusal.noSuchProduct": "That medicine is not on the farm's drug list",
  "refusal.noSuchVenture": "That venture is not one of yours",
  "refusal.notNotifiable":
    "That diagnosis is not one the farm's list says must be reported",
  "refusal.ownerWritesTheirOwn": "The owner writes down their own number",
  "refusal.prescriptionRaisesIt":
    "A prescription raises this work, one dose at a time",
  "refusal.itsRecordRaisesIt":
    "Its own record raises this work — a diagnosis, or the farm's registration: it is not raised by hand",
  "refusal.readyNeedsConfirming":
    "Ready for sale is confirmed against her withdrawal record, from the ready-for-sale list",
  "refusal.servedInTheFuture": "A service cannot be later than now",
  "refusal.tooManyForOnePaper":
    "One paper carries at most {limit, plural, one {# animal} other {# animals}}: make it in parts",
  "refusal.browserListensForAnother":
    "This phone's browser is already giving notices to somebody else: they turn theirs off first",
  "refusal.caseAlreadyOpen": "That vet already has a case open on her",
  "refusal.notAVisitingVet":
    "That person is not a visiting vet on this farm now",
  "refusal.visitEndsBeforeToday": "A visit has to last until today at least",
  "refusal.visitingVet":
    "A visiting vet sees only the animals on their own cases",
  "refusal.alreadyTrained":
    "That person is already marked as trained on this version",
  "refusal.notOverdueYet":
    "This work is not late yet: it has not had its chance",
  "refusal.movedOnSince":
    "She is no longer where this was decided on: open her page again and look",
  "refusal.sayHowMuchCame":
    "Say how much came — in its own unit, or in bags or maunds",
  "refusal.diedInTheFuture": "A death cannot be on a day that has not come yet",
  "refusal.arrivedInTheFuture":
    "An animal cannot have arrived on a day that has not come yet",
  "refusal.notASightingWord":
    "That is not one of the things the farm records seeing: choose from the list",
  "refusal.sayWhatWasSeen": "Say what was seen",
  "refusal.notThisAnimals":
    "That belongs to another animal: open it from her own page",
  "refusal.cannotDoThatWork":
    "That person does not hold the role this work is for",
  "refusal.notCheckedByAnyone": "Nobody signs this work off",
  "refusal.notYoursToSignOff": "This work is signed off by another role",
  "refusal.ownWorkNotSignedOff":
    "Work is signed off by someone other than the person who did it",
  "refusal.yourOwnNumber":
    "Only you, or whoever runs the farm, may write down your number",
  "refusal.tooManyRows":
    "Too many rows at once: split the sheet into smaller ones",
  "refusal.stateNotOfSide":
    "That state is not one of this side's: choose the other side, or another state",
  "refusal.noSuchChangeOfState":
    "An animal cannot go from the state she is in to that one",
  "refusal.alreadyInThatPen": "She is already in that pen",
  "refusal.calfMovedBeforeThat":
    "The calf was moved before that time, so the calving can't be after it",
  "refusal.soldOnSince":
    "She has been sold on since she was bought. Her owner is put right on the internal sale",
  "refusal.notOnThatLorry":
    "Not on that day's lorry: {tags}. Only animals still standing, or sold that day, can be",
  "refusal.soldInTheFuture": "A sale can't be on a day that hasn't come yet",
  "refusal.insideWithdrawalThatDay":
    "On that day she was still inside her meat withdrawal, so the sale can't be moved there",
  "refusal.leftBeforeHerLorry":
    "She went on a selling trip after that day, so she can't have left before it",
  "refusal.moneyMovedSince":
    "Money has moved on this since: the buyer has paid, something was written off, or the venture is settled. Correct it instead",
  "refusal.cannotBeVoided":
    "This was written before it could be voided. Correct it instead",
  "refusal.stateChangedSince":
    "Her state has changed since this was made. Look at her page and do it again",
  "refusal.noSuchPen": "That pen is no longer on the farm's list",
  "refusal.penNotYours": "That pen isn't one of yours. Ask the manager",
  "refusal.workClosed": "This work was already closed",
  "refusal.reviewClosed": "Somebody has already looked at this",
  "refusal.notHeldWork":
    "Only work a phone sent and the farm held can be taken in",
  "refusal.stillApplying":
    "The farm is still writing this down. It will be tried again",
  "refusal.pinNotProved":
    "The farm could not tell who was signed in on this phone when this was done. It is kept for the manager",
  "refusal.keepAnotherOwner": "The farm must keep at least one other owner.",
  "refusal.notSignedInThere": "They are not signed in there any more.",
  "refusal.visitUntilToday": "A visit has to last until today at least.",
  "refusal.visitIsForVets": "Only a vet is invited for a visit.",
  "refusal.managerStaffOrVisiting":
    "A manager may only do this for barn staff or a visiting vet.",
  "refusal.managerStaffOnly": "A manager may only do this for barn staff.",
  "refusal.noInviteWaiting": "No invite is waiting to be taken up.",
  "refusal.notOnThisFarm": "That person is not on this farm.",
  "refusal.codeNotValid": "That code is not right. Ask for a new one.",
  "refusal.tooManyCodes":
    "Too many wrong codes. Wait fifteen minutes, then try again.",
  "refusal.pinTooEasy":
    "That PIN is one anybody would try first. Choose four digits that are not a run or one digit repeated.",
  "refusal.pinFourDigits": "A PIN is four digits.",
  "refusal.hasLeftTheFarm": "That person no longer works on this farm.",
  "refusal.cannotDisableYourself": "You cannot disable yourself.",
  "refusal.phoneRevoked":
    "This phone is no longer one of the farm's. Ask the manager for a code to enroll it again",
  "refusal.tooManyPins":
    "Too many wrong PINs: wait fifteen minutes, or ask the manager",
  "refusal.cannotWorkHere": "That person cannot work on this farm now",
  "refusal.staffOnlyOnShedPhone": "Only barn staff work on a shed phone",
  "refusal.calvedLately":
    "She calved too lately to calve again: this is the same calving written twice, or a twin of it, which is one calving with two calves",
  "refusal.calvedBeforeHerService":
    "That is too soon after the service she is carrying from to be its calving: check the day",
  "refusal.writtenOffMoreThanOwed":
    "Only {currencySign}{owingMoney} is still owed on it",
  "refusal.nothingOwedOnIt": "Nothing was ever owed on that",
  "refusal.ventureOwnsHer":
    "She belongs to a venture, and a venture's animal cannot cross to the dairy side",
  "refusal.notAVenturesAnimal":
    "A venture owns bought-in fattening animals and no others",
  "refusal.cattleBudgetShort":
    "The cattle budget is not holding that much — the rest of the account keeps the animals",
  "refusal.floatAlreadyDrawn": "That outing has been given money already",
  "refusal.tripIsAnotherVentures":
    "That outing is bringing another venture's animals home",
  "refusal.tripIsTheFarms":
    "That outing is bringing the farm's own animals home",
  "refusal.ventureBuysByBank":
    "A venture's bull bought with no outing is paid from its account by bank, with the reference",
  "refusal.notHeldHere":
    "That sale's cash is not held in this hand for this venture",
  "refusal.namesNoFarmAccount":
    "Say which of the farm's accounts the mobile money or bank money went into or came out of",
  "refusal.farmAccountNotThatKind":
    "That farm account is not the kind the money moved by",
  "refusal.farmAccountRetired": "That farm account has been retired",
  "refusal.needsItsReference":
    "Mobile money or bank money carries its transaction ID or reference",
  "refusal.referenceUsedAlready":
    "That transaction ID is on this farm account already",
  "refusal.farmAccountListedAlready": "That number is listed already",
  "refusal.farmAccountRetiredAlready":
    "That number is listed already, retired. Bring it back instead",
  "refusal.beforeTheFirstReading":
    "That month is before this account's first reading",
  "refusal.alreadyDeposited": "That sale's money has been deposited already",
  "refusal.ventureSaleNotByMobileMoney":
    "A venture's animal is paid for by bank or in cash, never by mobile money",
  "refusal.saleCashInAHand":
    "Sale cash is still in a hand, not yet deposited in the venture account",
  "refusal.floatAlreadyReconciled":
    "That outing's float has been counted; it takes nothing more",
  "refusal.floatOver":
    "The animals, the outing's costs and the cash back come to more than went out",
  "refusal.floatShort":
    "The animals, the outing's costs and the cash back come to less than went out",
  "refusal.notWhoseFloatBoughtHer":
    "That outing went to the livestock market on another purse's money, so she is that purse's",
  "refusal.windowIsTheVentures":
    "A venture's animal is sold in the venture's target window; an amendment moves it, not the intake",
  "refusal.windowNeeded":
    "She is the farm's own now: say the window the farm sells her in",
  "refusal.sheIsGone":
    "She has left the farm — sold, died or culled — and nothing more can be written of her",
  "refusal.sheIsReadyForSale":
    "She is ready for sale, and a finished bull is not moved between purses",
  "refusal.alreadyThatPurse": "She is already theirs",
  "refusal.neverWeighed":
    "She has never been weighed, so there is no price anybody could defend",
  "refusal.weighedTooLongAgo":
    "Her last weighing is too old to price on — weigh her again first",
  "refusal.noQuarantinePen": "Mark a pen as a quarantine pen first",
  "refusal.notAQuarantinePen":
    "A bought animal comes into quarantine in a quarantine pen",
  "refusal.penHoldsQuarantine":
    "An animal in quarantine is in this pen — release or walk her first",
  "refusal.staysInQuarantine":
    "An animal in quarantine stays in a quarantine pen until she is released",
  "refusal.penHoldsHerd":
    "{tagNumber} of the dairy herd is in this pen — walk her out first",
  "refusal.shedNameTaken": "The farm has a shed by that name already",
  "refusal.notATimeOfDay": '"{time}" is not a time of day',
  "refusal.investorWarningAfterCap":
    "The investor warning comes before the cap, not after it",
  "refusal.aiWindowBackwards": "The AI window has to close after it opens",
  "refusal.aiWindowTooLong": "The AI window cannot be longer than a day",
  "refusal.quietHoursSame":
    "Quiet hours that begin when they end are not quiet hours. Set them apart",
  "refusal.penNameTaken": "This shed has a pen by that name already",
  "refusal.quarantinePenNotForHerd":
    "A quarantine pen is no place for the dairy herd",
  "refusal.arrivalDoseOwed":
    "Still owed: {doses} — he leaves quarantine once it is given, or the vet writes why it is not needed",
  "refusal.doseNotOwed": "He does not owe that dose",
  "refusal.deathNeedsAPhoto": "Add a photograph of her, her tag showing",
  "refusal.windUpNotOver":
    "The wind-up period has not ended; there are still days to sell in",
  "refusal.nothingLeftToBuy": "This venture has no animals left to buy",
  "refusal.bankRateFromTheFuture":
    "A bank's rate holds from a day that has come, not one still ahead",
  "refusal.crossingUnweighed":
    "Nobody has weighed her since she crossed. Weigh her first",
  "refusal.joiningNeedsAWindow":
    "Say which target window she is being fed towards; the next Eid could not be worked out",
  "refusal.anAnimalStillStands": "An Animal of this venture is still standing",
  "refusal.anAnimalIsMissing":
    "An animal of this venture is missing: find her, or write her off and the farm makes her good",
  "refusal.madeGoodWithTheFarmsMoney":
    "That made a lost animal good from the farm's own money. Written off against the wrong tag, take the write-off back on her page; found, she becomes the farm's",
  "refusal.notFattening":
    "Only an animal being fattened can be made ready for sale",
  "refusal.soldBeforeSheCame":
    "She cannot be sold on a day before she came, or before she last changed hands",
  "refusal.termsChanged":
    "It has been corrected since you read it. Read it again before approving",
  "refusal.handedLaterThanNow": "Cash cannot have changed hands later than now",
  "refusal.splitNotTheFarms":
    "The farm's own units in this venture are on a {investorsPercent}% split; every investor signs on the same",
  "refusal.splitNotTheVentures":
    "This venture's investors are on a {investorsPercent}% split: every investor signs on the same, or an amendment moves them all",
  "refusal.theFarmsOwnUnits":
    "The farm's own units are its own capital: they are signed, papered and told nothing as a person's are",
  "refusal.madeGoodNeedsReference":
    "A venture's lost animal is made good by the farm: give the transfer's reference",
  "refusal.aPriceIsMissing":
    "Feed was given or a dose used that nothing can put a price on",
  "refusal.aFloatIsOpen": "A buying float has not been counted home",
  "refusal.aReimbursementIsOwed":
    "A month's reimbursement has not been transferred",
  "refusal.theAccountDoesNotAddUp": "The account does not add up",
  "refusal.theBankDisagrees":
    "A month has not been read against the statement, or did not agree",
  "refusal.nobodyHasSigned": "Nobody has signed for this venture",
  "refusal.agreementsDisagree":
    "This venture's agreements were signed on different splits",
  "refusal.alreadyApproved":
    "This venture's settlement has already been approved",
  "refusal.notYetApproved": "Nothing is owed until the settlement is approved",
  "refusal.alreadyPaid": "That has already gone out",
  "refusal.notWhatHeIsOwed": "That is not what this settlement owes him",
  "refusal.notYetPaid": "He cannot have had money nobody has sent him",
  "refusal.noAdvanceToRepay": "You put nothing of your own into this venture",
  "refusal.noFarmShareToTake": "This venture made the farm nothing to take",
  "refusal.advanceComesFirst":
    "Your own money comes back before any capital does",
  "refusal.alreadyAcknowledged": "He has already said he had it",
  "refusal.nothingToPayHim":
    "The run lost more than he put in, so there is nothing to send him",
  "refusal.adjustmentIsClosed": "That adjustment has already been dealt with",
  "refusal.nothingHasChanged":
    "Nothing has changed since this settlement was approved",
  "refusal.nothingToPayOnIt":
    "Nothing is owed on this adjustment; waive it instead",
  "refusal.weighedAgainSince":
    "She has been weighed since you read that price — check the new one",
  "refusal.notAFatteningAnimal":
    "Investor money funds fattening, and a dairy cow is the farm's",
  "refusal.buyerCannotTrade":
    "The venture taking her on is past taking animals on",
  "refusal.nothingToReimburse":
    "Its animals consumed nothing of the farm's that month",
  "refusal.monthAlreadyReimbursed": "That month has been reimbursed already",
  "refusal.monthNotOver": "That month is not over yet",
  "refusal.monthBeforeTheVenture": "That month is before this venture opened",
  "refusal.sayWhatYouFoundOut":
    "Say what you found out about the month that did not agree",
  "refusal.ventureIsSettled":
    "That venture is settled — raise a settlement adjustment rather than changing what it was paid on",
  "refusal.ventureIsCanceled":
    "That venture was called off and its money sent back; what came in cannot change now",
  "refusal.oneSideOfASale":
    "That is one side of an internal sale: put the sale right from its row, and both sides follow",
  "refusal.reimbursementIsComputed":
    "A month's reimbursement is what its costs came to; its day and its reference are still yours to correct",
  "refusal.sellerCannotTrade":
    "The venture letting her go is past letting animals go",
  "refusal.cashBackNeedsASlip":
    "Cash coming back needs the day it was deposited and the slip's number",
  "nominees.title": "Nominees",
  "nominees.noneForAnOrganization":
    "An organization names no nominee: its share is its own, whoever signs for it",
  "nominees.hint":
    "Who collects their capital and share for their lawful heirs if they die before a Venture settles. Only a paper they sign changes them.",
  "nominees.none": "No Nominee",
  "nominees.noneHint":
    "If they die, the money goes straight to their lawful heirs, usually against a succession certificate.",
  "nominees.notSignedFor": "Not yet signed for",
  "nominees.notSignedForHint":
    "Written down before Nominations were kept. It counts once they sign a মনোনয়নপত্র or an Agreement naming them.",
  "nominees.offerInApp": "Offer in the app",
  "nominees.offerInAppHint":
    "They read it in the portal and agree with a code; once you approve it, it is their list.",
  "nominees.offerMinor":
    "A Nominee is a minor: this মনোনয়নপত্র is signed on paper, with their Receiver.",
  "nominees.offerStanding":
    "A মনোনয়নপত্র is offered to them in the app already; withdraw it before offering another.",
  "nominees.offered": "মনোনয়নপত্র offered in the app",
  "nominees.offerWaiting":
    "মনোনয়নপত্র offered in the app {on} — waiting for them to agree",
  "nominees.offerAgreed":
    "They agreed to the মনোনয়নপত্র offered in the app {on} — waiting for your approval",
  "nominees.offerApproved": "Their list of Nominees is updated",
  "nominees.offerApprovedAlready":
    "It is approved already; it is their list of nominees now.",
  "nominees.offerRetired":
    "A retired Investor signs nothing new; bring them back first.",
  "nominees.from.nomination": "মনোনয়নপত্র signed {day}",
  "nominees.from.agreement": "Named in the {venture} Agreement, signed {day}",
  "nominees.from.carried_over": "Carried over {day}",
  "nominees.from.in_app": "মনোনয়নপত্র agreed in the app {day}",
  "nominees.born": "Born {day}",
  "nominees.minor": "Minor",
  "nominees.share": "{share}%",
  "nominees.receiver": "Collected by {name}",
  "nominees.earlier": "Earlier Nominations",
  "refusal.signedInFuture": "A paper cannot be signed on a day still to come.",
  "refusal.signedBeforeStamped":
    "An agreement cannot be signed before its stamp was bought: give a signing day on or after the stamp's.",
  "refusal.signedBeforeOpened":
    "An agreement cannot be signed before its venture was opened.",
  "refusal.signedBeforeAmended":
    "The venture's agreements were amended after that day, so a paper signed before it names the old terms. Print a fresh one and have it signed.",
  "refusal.signedBeforeInForce":
    "This মনোনয়নপত্র is dated before the one in force. Check the day it was signed.",
  "nominees.problem.too_many": "At most three Nominees.",
  "nominees.problem.name_missing": "Every Nominee needs a name.",
  "nominees.problem.born_missing":
    "Every Nominee needs a date of birth: it decides who is a minor.",
  "nominees.problem.born_in_future": "A date of birth cannot be in the future.",
  "nominees.problem.shares_not_whole":
    "Each share is a whole percentage, at least 1.",
  "nominees.problem.shares_not_hundred": "The shares must add up to 100%.",
  "nominees.problem.receiver_missing":
    "A Nominee under eighteen needs a Receiver to collect for them.",
  "nominees.problem.receiver_not_needed":
    "Only a Nominee under eighteen has a Receiver.",
  "nominees.problem.nid_missing":
    "Every Nominee eighteen or over needs their NID number.",
  "nominees.problem.birth_registration_missing":
    "A Nominee under eighteen needs their birth registration number.",
  "nominees.problem.receiver_nid_missing":
    "The Receiver needs their NID number: they are the one who collects.",
  "nominees.new": "New মনোনয়নপত্র",
  "nominees.newTitle": "A new মনোনয়নপত্র for {name}",
  "nominees.newHint":
    "Write down every Nominee they want, then have them sign. It becomes the list in force for all their Agreements.",
  "nominees.section.who": "Nominees",
  "nominees.section.whoHint":
    "Everyone they name, each with a share; the shares must add up to 100%.",
  "nominees.section.how": "How they sign",
  "nominees.section.onPaper": "Signed on paper",
  "nominees.way.paper": "On paper, in front of you",
  "nominees.way.paperHint":
    "Print it and have them sign, then record the day and a photo of the paper.",
  "nominees.way.app": "In the app, with a code",
  "nominees.add": "Add a Nominee",
  "nominees.remove": "Take this one off",
  "nominees.place": "Nominee {place}",
  "nominees.name": "Name",
  "nominees.relation": "Relation to them",
  "nominees.bornOn": "Date of birth",
  "nominees.nid": "NID number",
  "nominees.birthRegistration": "Birth registration number",
  "nominees.phone": "Phone",
  "nominees.sharePercent": "Share",
  "nominees.receiverHeading": "Under eighteen: who collects for them",
  "nominees.receiverName": "Receiver's name",
  "nominees.receiverRelation": "Relation to the Nominee",
  "nominees.receiverPhone": "Receiver's phone",
  "nominees.receiverNid": "Receiver's NID number",
  "nominees.nidIs": "NID {number}",
  "nominees.birthRegistrationIs": "Birth registration {number}",
  "nominees.numberNotGiven": "No NID given",
  "nominees.birthRegistrationNotGiven": "No birth registration given",
  "nominees.total": "Shares so far: {total}%",
  "nominees.noneYet": "No Nominee: the money would go straight to their heirs.",
  "nominees.print": "Print the মনোনয়নপত্র to sign",
  "nominees.printHint":
    "Laid out from the Nominees above, for them to sign and date in front of you.",
  "nominees.paperTitle": "মনোনয়নপত্র",
  "nominees.signedOn": "Day they signed it",
  "nominees.photo": "The signed paper",
  "nominees.photoHint":
    "A photo of the signed মনোনয়নপত্র, kept as the farm's proof that they named these people themselves. No photo to hand? Add it later.",
  "nominees.photoTake": "Photograph the মনোনয়নপত্র",
  "nominees.record": "Record the মনোনয়নপত্র",
  "nominees.recorded": "মনোনয়নপত্র recorded: these are now their Nominees",
  "nominees.photoKept": "Photo kept",
  "nominees.photoMissing": "No photo kept yet",
  "nominees.keepPhoto": "Add the photo",
  "nominees.seePhoto": "See the photo",
  "nominees.replacePhoto": "Replace the photo",
  "nominees.photoTitle": "The signed মনোনয়নপত্র",
  "nominees.photoDialogHint":
    "As the farm keeps it. Have a clearer photo? Replace it: the new one takes this one's place.",
  "nominees.photoKeptNow": "Photo of the মনোনয়নপত্র kept",
  "refusal.nominationHasNoPaper":
    "Only a মনোনয়নপত্র has a paper of its own. Nominees named in an agreement are proved by the agreement's photo.",
  "nav.investors": "Investors",
  "nav.templates": "Agreement templates",
  "params.approvalThreshold": "Owner approves spending above",
  "params.aiWindowStart": "AI window opens after heat",
  "params.aiWindowEnd": "AI window closes after heat",
  "params.pregnancyCheck": "Pregnancy check after service",
  "params.gestation": "Gestation",
  "params.dryOffLead": "Dry off before calving",
  "params.calvingPrepLead": "Calving pen before calving",
  "params.repeatBreeder": "Repeat breeder after",
  "params.fatteningTarget": "Default fattening target",
  "params.readyLeadDays": "Suggest for sale this many days before Eid",
  "params.gainReadDays": "Judge a bull's gain against his ration over at least",
  "params.deshiGainPercent":
    "Judge a deshi animal at this share of its ration's expected gain",
  "params.femaleGainPercent": "Judge a cow or heifer at this share of it",
  "params.penGainPercent":
    "Point out one gaining under this share of his penmates",
  "params.renewalLead": "Warn before DLS registration expires",
  "params.minutes": "minutes",
  "params.hours": "hours",
  "params.days": "days",
  "params.percent": "%",
  "params.money": "{currencySign}",
  "params.kg": "kg",
  "params.attempts": "attempts",
  "params.save": "Save parameters",
  "params.saved": "Parameters saved",
  "sighting.report": "Report what you see",
  "sighting.hint":
    "No round asked, but something is wrong — or she is in heat. The vet sees it, and a heat starts the breeding work.",
  "sighting.what": "What did you see?",
  "sighting.note": "Anything to add (optional)",
  "sighting.noteNeeded": "Say what you saw",
  "sighting.save": "Record it",
  "sighting.recorded": "Recorded — the vet will see it",
  "sighting.queued": "Kept on this phone — it goes when there is signal",
  "sighting.reported": "reported",
  "visit.invite": "A vet called in for a visit",
  "visit.inviteHint":
    "They see only the animals you open a case for, and only until the end of this day.",
  "visit.lastDay": "Last day of the visit",
  "visit.until": "Visiting vet until {date}",
  "visit.change": "Change",
  "visit.changed": "Visit changed",
  "visit.end": "End the visit",
  "visit.ended": "Visit ended — their cases are closed",
  "cases.title": "Cases for a visiting vet",
  "cases.hint":
    "A visiting vet sees and treats only the animals on their cases.",
  "cases.vet": "Visiting vet",
  "cases.reason": "Why they are called",
  "cases.open": "Open a case",
  "cases.opened": "Case opened",
  "cases.close": "Close",
  "cases.closed": "Case closed",
  "cases.none": "No visiting vet has a case on her",
  "cases.noVets": "No visiting vet has access now — invite one from People.",
  "cases.by": "{vet} · {reason}",
  "cases.mine": "Your cases",
  "cases.mineHint":
    "You were called in for these animals. You see and treat only them.",
  "cases.mineNone": "No cases open for you",
  "role.visitingVet": "Visiting vet",
  "common.retry": "Try again",
  "common.save": "Save",
  "common.forbidden": "This is not open to your role",
  "common.signedOut": "You have been signed out — sign in again",
  "common.refreshFailed":
    "Could not refresh — showing what this phone last had",
  "nav.audit": "Audit log",
  "nav.animals": "Animals",
  "nav.herd": "Sheds and pens",
  "nav.breeds": "Breeds",
  "breeds.subtitle":
    "The breeds an animal is written down under. The standard ones come with the farm; add your own. One no longer used is retired, never removed.",
  "breeds.add": "Add a breed",
  "breeds.new": "New breed",
  "breeds.newHint":
    "Give it the name the farm uses. An English name is shown to anyone reading in English.",
  "breeds.renameTitle": "Rename {name}",
  "breeds.renameHint": "Every animal of this breed takes the new name.",
  "breeds.nameBn": "Name in Bangla",
  "breeds.nameEn": "Name in English",
  "breeds.nameEnHint": "Optional",
  "breeds.standard": "Standard",
  "breeds.deshi": "Deshi",
  "breeds.markDeshi": "Mark as deshi",
  "breeds.col.gain": "Judged at",
  "breeds.gain.own": "Its own {percent}%",
  "breeds.gain.deshi": "The deshi share, {percent}%",
  "breeds.gain.asWritten": "The ration as written",
  "breeds.gain.farm":
    "{animals, plural, one {# bull} other {# bulls}} here: {median}% (middle half {low}–{high}%)",
  "breeds.gain.use": "Use {percent}%",
  "breeds.gain.used": "Judged at {percent}% now",
  "breeds.gain.cleared": "Judged as before",
  "breeds.gain.set": "Set its gain share",
  "breeds.gain.title": "{name}: its share of the expected gain",
  "breeds.gain.hint":
    "An animal of this breed is judged at this share of its ration's expected gain, in place of the deshi share. A cow or heifer is still judged at the female share on top. From 30% to 120%.",
  "breeds.gain.between": "From {least}% to {most}%",
  "breeds.gain.label": "Share of the ration's expected gain",
  "breeds.gain.farmHint":
    "{figure}. From bulls only — a cow or heifer carries the female share too.",
  "breeds.gain.noFigure":
    "Fewer than five of its bulls have been weighed long enough on a ration with an expected gain to say what they put on.",
  "breeds.gain.clear": "Judge it as before",
  "breeds.markCross": "Mark as not deshi",
  "breeds.deshiChoice": "Deshi — the country's own cattle",
  "breeds.deshiHint":
    "Deshi cattle put on less than a cross on the same feed, so an animal of this breed is judged against the farm's deshi share of its ration's expected gain.",
  "breeds.retired": "Retired",
  "breeds.retire": "Retire",
  "breeds.retireTitle": "Retire {name}?",
  "breeds.retireWhy":
    "No new animal can be written down under it. The animals already of it keep it, and it can be restored.",
  "breeds.restore": "Restore",
  "breeds.none": "No breeds yet",
  "breeds.manage": "Add or rename breeds",
  "breeds.choose": "Not known",
  "refusal.breedExists": "The farm already has a breed by that name",
  "common.retired": "Retired",
  "feed.retireTitle": "Retire “{name}”?",
  "feed.retireWhy":
    "Nothing new is fed, bought or counted as it. What a pen was fed with it keeps its name, and it can be restored.",
  "byHand.restore": "Restore",
  "notifiable.restore": "Restore to the list",
  "notifiable.restoreHint":
    "Say why it is reportable again: the office's word, and when.",
  "notifiable.restored": "Restored to the list",
  "refusal.drugExists": "That product is already on the list",
  "refusal.drugExistsRetired":
    "That product is on the list, retired — restore it rather than adding it twice",
  "refusal.diseaseExists": "That disease is already on the list",
  "refusal.diseaseExistsRetired":
    "That disease is on the list, taken off — restore it rather than adding it twice",
  "refusal.breedUnknown": "That breed is not on the farm's list",
  "refusal.breedRetired":
    "That breed is retired. Restore it on the Breeds page to write an animal under it.",
  "herd.addShed": "Add a shed",
  "herd.addPen": "Add a pen",
  "herd.quarantinePen": "Quarantine pen",
  "herd.quarantineAstray":
    "In quarantine, but not in a quarantine pen — walk them into one",
  "herd.shedName": "Shed name",
  "herd.penName": "Pen name",
  "herd.rename": "Rename",
  "list.rename": "Rename",
  "list.renameTitle": "Rename {name}",
  "list.renameHint":
    "Put a slip in the name right. Everything that named it before names it by the new name; the trail keeps the old one.",
  "herd.penRetired": "Retired",
  "herd.retirePen": "Retire pen",
  "herd.restorePen": "Bring back",
  "herd.penRetiredDone": "Pen retired: it is out of every list",
  "herd.penRestoredDone": "Pen brought back",
  "herd.retireShed": "Retire shed",
  "herd.restoreShed": "Bring back",
  "herd.shedRetiredDone": "Shed retired: it is out of every list",
  "herd.shedRestoredDone": "Shed brought back",
  "herd.noSheds": "No sheds yet",
  "herd.noShedsHint": "Add the farm's first shed, then the pens inside it.",
  "herd.subtitle":
    "The farm's buildings and the pens inside them. Renaming keeps every animal where it is.",
  "herd.animalCount": "{count, plural, one {# animal} other {# animals}}",
  "herd.headOfCapacity": "{head} of {capacity}",
  "herd.overCapacity": "{count} over",
  "herd.setCapacity": "Capacity",
  "herd.capacityTitle": "How many head fit in {pen}",
  "herd.capacityLabel": "Head it holds",
  "herd.capacityHint":
    "Count the stalls and the trough. Leave it empty if nobody has counted: a pen over its capacity is shown, never shut.",
  "animals.penOverCapacity":
    "After this move {head} will stand in {pen}, which is built for {capacity}.",
  "herd.import": "Opening register",
  "herd.importHelp":
    "Paste the CSV, with the template's columns: tag, sex, side, state, pen, source, breed, birth_date, calved_at, expected_calving, official_tag, alias. Dates are written year-month-day, like 2025-03-15. tag is the number on her ear tag, like D-0001; left blank, she is given the next number",
  "herd.importRun": "Import",
  "herd.imported": "{count} imported",
  "herd.failedRows":
    "{count, plural, one {# row} other {# rows}} could not be imported",
  "herd.row.registerDateUnread":
    "the date “{value}” in {column} cannot be read — write it year-month-day, like 2025-03-15",
  "herd.row.registerValueUnread":
    "“{value}” in {column} cannot be read — see the runbook for what goes in it",
  "herd.row.registerUnknownPen":
    "no pen is called “{value}” — write the name as it is under sheds and pens",
  "herd.row.registerUnknownBreed":
    "“{value}” is not on the breed list — add it to the farm's breeds first",
  "herd.row.registerStateNotOfSide":
    "the state “{value}” does not belong to this row's side",
  "herd.row.expectedCalvingNeeded":
    "a pregnant heifer needs her expected_calving date",
  "herd.row.tagTaken": "{value} is already another animal's number",
  "herd.row.tagOfTheOtherSide":
    "{value} is a number of the other side — dairy numbers start D-, fattening F-",
  "herd.row.notATagNumber":
    "“{value}” is not a tag number — write it like D-0001",
  "herd.row.registerNotTaken": "the farm could not take this row",
  "herd.row.penInTwoSheds":
    "two sheds have a pen by this name: write it as shed/pen",
  "herd.warnedRows":
    "{count, plural, one {# animal added without} other {# animals added without}} something the farm needs",
  "herd.row.registerNoCalvingDate":
    "{tag} added with no calved_at — how long she has been in milk cannot be said",
  "herd.line": "Line {line}",
  "herd.penCount": "{count, plural, one {# pen} other {# pens}}",
  "herd.noPens": "No pens in this shed yet",
  "herd.col.pen": "Pen",
  "herd.col.animals": "Animals",
  "herd.importDescription":
    "Bring in the animals already on the farm, one row each. Rows that cannot be read are listed with their line; the rest are added.",
  "herd.importFile": "Choose a CSV file",
  "herd.importRows": "Rows",
  "animals.subtitle":
    "Every animal on the farm you work, by her tag number. Type to narrow; press Find to open.",
  "animals.count": "{count, plural, one {# animal} other {# animals}}",
  "animals.searchPlaceholder": "Tag number, e.g. D-0001",
  "goTo.label": "Go to tag number",
  "goTo.title": "Go to an animal",
  "goTo.hint": "Type her tag number; Enter opens her page.",
  "goTo.matches": "Animals by that tag number",
  "animals.milkHeld": "Milk held",
  "animals.meatHeld": "Meat held",
  "animals.noMatch":
    "No animal's tag number matches that. Check the number on her ear tag.",
  "animals.noneHint":
    "Animals appear here once they are registered or taken in.",
  "animals.col.tag": "Tag number",
  "animals.col.held": "Held",
  "animals.title": "Animals",
  "animals.search": "Find by tag number",
  "animals.find": "Find",
  "animals.none": "No animals here yet",
  "animals.register": "Register an animal",
  "animals.sex": "Sex",
  "animals.sex.female": "Female",
  "animals.sex.male": "Male",
  "animals.side": "Side",
  "animals.side.dairy": "Dairy",
  "animals.side.fattening": "Fattening",
  "animals.state": "State",
  "animals.pen": "Pen",
  "animals.source": "Source",
  "animals.source.born": "Born here",
  "animals.source.bought": "Bought",
  "animals.breed": "Breed",
  "animals.officialTag": "Official tag",
  "animals.aliases": "Old marks",
  "animals.registered": "Registered as {tag}",
  "animals.registerHint":
    "For an animal that did not come in through intake or a calving. The farm gives her the next tag number.",
  "animals.birthDate": "Date of birth",
  "animals.move": "Move",
  "animals.moveTo": "Move to pen",
  "animals.moved": "Moved",
  "animals.moveQueued": "Kept on this phone — she moves when there is signal",
  "animals.retag": "Replace the ear tag",
  "animals.retagged": "Re-tag recorded",
  "animals.moveReason.born": "Born here",
  "animals.moveReason.intake": "Came in from the market",
  "animals.moveReason.registered": "Registered",
  "animals.moveReason.openingRegister": "From the opening register",
  "animals.moveReason.weaned": "Weaned",
  "animals.lastInPen": "Last in {pen}",
  "animals.lastPen": "Last pen",
  "animals.reason": "Reason",
  "animals.setState": "Change state",
  "animals.stateChanged": "State changed",
  "animals.photo": "Photo",
  "animals.photoTake": "Take a photo",
  "animals.photoSaved": "Photo saved",
  "animals.moveFromWork": "From the work",
  "animals.kpi.herd": "In the herd",
  "animals.kpi.herdHint": "Not counting animals that have left",
  "animals.kpi.sides": "Dairy · Fattening",
  "animals.kpi.milkHeldHint": "Milk kept out of the tank",
  "animals.kpi.meatHeldHint": "Not fit for sale yet",
  "animals.filter.allStates": "All states",
  "animals.filter.allPens": "All pens",
  "animals.filter.anyHold": "Held or clear",
  "animals.filter.held": "Anything held",
  "animals.filter.clear": "Clear filters",
  "animals.filter.open": "Filters",
  "animals.age": "Age",
  "animals.ageYears":
    "{years, plural, one {# year} other {# years}} {months, plural, one {# month} other {# months}}",
  "animals.ageWholeYears": "{years, plural, one {# year} other {# years}}",
  "animals.ageEstimated": "about {age}",
  "animals.bornAround": "around {month}",
  "common.more": "More",
  "animals.moreFor": "{tag} — more actions",
  "animals.tab.overview": "At a glance",
  "animals.tab.breeding": "Breeding",
  "animals.tab.health": "Health",
  "animals.tab.weight": "Weight & moves",
  "animals.tab.money": "Money & papers",
  "animals.papers": "Papers",
  "animals.papersHint": "What the farm hands a buyer or an inspector about her",
  "animals.about": "About her",
  "animals.withdrawal": "Withdrawal",
  "animals.daysInMilk": "day {days} in milk",
  "animals.recordedBy": "Recorded by",
  "animals.noAbortions": "No pregnancy lost",
  "animals.breedingNone": "Nothing on her breeding yet",
  "animals.breedingNoneHint":
    "Heats, services, pregnancy checks and calvings show here as they are recorded.",
  "animals.healthNone": "Nothing seen or given yet",
  "observations.all": "Everything",
  "observations.withdraw": "Withdraw",
  "observations.withdrawHint":
    "Seen against the wrong animal, or seen wrong: the work it raised is called off. Write it again against the animal really seen.",
  "observations.withdrawIt": "Withdraw it: she was not seen so",
  "observations.none": "Nothing has been noticed in the last few days",
  "observations.days": "Last {days, plural, one {# day} other {# days}}",
  "observations.col.saw": "Seen",
  "observations.col.when": "When",
  "observations.col.by": "Seen by",
  "observations.col.from": "From",
  "nav.observations": "Observations",
  "animals.treatments": "What she has been given",
  "animals.dosesOwed": "Still owed",
  "animals.doseComesRound": "comes round again {day}",
  "animals.doseNotRaised": "not raised again yet",
  "animals.doseNotNeeded": "Not needed",
  "animals.excuseTakeBack": "Take back",
  "animals.excuseTakeBackHint":
    "The reason was for another animal: the dose is owed again and raised again for him. Not once he is released on it.",
  "animals.excuseTakeBackIt": "Take the excuse back: the dose is owed",
  "animals.doseNotNeededWhy": "Why it is not needed",
  "animals.doseNotNeededHint":
    "Write why this dose is not needed — given at the farm he came from, say, and you saw the card. It is then not owed, and he may leave quarantine.",
  "animals.doseExcused": "Vet: not needed — {reason}",
  "animals.fromCampaign": "campaign",
  "animals.observationWithdrawn": "Withdrawn",
  "sop.effect.registration_renewal": "Renews the registration",
  "sop.effect.observation": "What was seen (health, heat)",
  "sop.choices": "What may be chosen",
  "sop.choicesHelp": "Comma separated, in Bangla",
  "animals.movesHistory": "Moves",
  "animals.retagsHistory": "Re-tags",
  "animals.col.givenBy": "Given by",
  "animals.col.fromPen": "From pen",
  "animals.col.toPen": "To pen",
  "animals.notFound": "No animal with that tag number",
  "state.calf": "Calf",
  "state.heifer": "Heifer",
  "state.pregnant_heifer": "Pregnant heifer",
  "state.milking": "Milking",
  "state.dry": "Dry",
  "state.quarantine": "Quarantine",
  "state.fattening": "Fattening",
  "state.ready_for_sale": "Ready for sale",
  "state.sold": "Sold",
  "state.died": "Died",
  "state.culled": "Culled",
  "state.lost": "Lost",
  "nav.devices": "Shed phones",
  "device.add": "Enroll a phone",
  "device.name": "Phone name",
  "device.code": "Enrollment code",
  "device.codeHelp":
    "Type this code into the phone within {minutes, plural, one {# minute} other {# minutes}}",
  "device.claimed": "In use",
  "device.unclaimed": "Waiting to be set up",
  "device.revoked": "Revoked",
  "device.revoke": "Revoke",
  "device.lastSeen": "Last used {when}",
  "device.col.lastUsed": "Last used",
  "device.none": "No shed phones yet",
  "device.subtitle":
    "Farm phones kept in a shed. Barn Staff switch to themselves on one with their PIN.",
  "device.addWhy":
    "Name it after where it stays. A code to type into the phone comes next.",
  "device.codeTitle": "The code for {name}",
  "device.codeWhere":
    "On the phone, open OpenFarm, choose “Set up this phone” and type this code.",
  "device.expired": "Code expired",
  "device.rowActions": "{name} — more actions",
  "device.revokeTitle": "Revoke {name}?",
  "device.revokeWhy":
    "It stops working at once and is told nothing more. To use it again, add it afresh.",
  "device.promise.title":
    "The shed's work, written in the shed — one phone for everyone.",
  "device.promise.pin":
    "Everyone signs in with their own PIN, and their work is recorded as theirs.",
  "device.promise.offline":
    "It keeps working without signal, and sends everything when signal comes back.",
  "device.promise.lock": "It locks itself when nobody is using it.",
  "device.setup": "Set up this phone",
  "device.setupHelp":
    "Type the code on the manager's screen — ten letters and numbers.",
  "device.enroll": "Set up",
  "device.enrolled": "This phone is ready",
  "device.whoAreYou": "Who is working?",
  "device.enterPin": "Enter your PIN",
  "device.wrongPin": "That PIN is not right",
  "device.pinDelete": "Delete the last digit",
  "device.lock": "Lock",
  "device.onShedPhone": "Working on the shed phone",
  "device.startWork": "Start work",
  "device.switchPerson": "Lock / switch person",
  "device.workingAs": "Working as {name}",
  "device.noRoster": "Nobody has a PIN yet. Ask the manager.",
  "device.offlineRoster": "Using the list saved on this phone",
  "people.pin": "PIN",
  "people.changePin": "Change PIN",
  "people.pinIsSet":
    "Has a PIN, and switches in on the shed phones with it. Once given it is never shown again; a new one replaces it.",
  "people.setPin": "Set PIN",
  "people.pinSet": "PIN set",
  "people.pinHelp": "Four digits",
  "nav.sops": "Playbook",
  "sop.title": "Playbook",
  "sop.subtitle":
    "Everything the farm does, written down — what raises it, who does it, who checks it.",
  "sop.none": "No procedures yet",
  "sop.version": "Version {number}",
  "sop.col.version": "Version",
  "sop.new": "New procedure",
  "sop.standard.title": "Standard procedures",
  "sop.standard.hint":
    "Procedures OpenFarm offers to start from. None raises work until you have read it and published it.",
  "sop.standard.adopt": "Read and publish",
  "sop.standard.need.calvingPen": "The calving pen",
  "sop.standard.need.weanedBullPen":
    "The fattening pen weaned bull calves go to",
  "sop.standard.need.fmdVaccine": "The FMD vaccine",
  "sop.standard.need.lsdVaccine": "The lumpy skin vaccine",
  "sop.standard.need.dewormer": "The dewormer",
  "sop.standard.need.flukeDrench": "The liver fluke drench",
  "sop.standard.need.hsVaccine": "The HS vaccine",
  "sop.standard.need.bqVaccine": "The BQ vaccine",
  "sop.standard.need.anthraxVaccine": "The anthrax vaccine",
  "sop.standard.need.tickSpray": "The tick and fly spray",
  "sop.standard.need.calfDewormer": "The calf dewormer",
  "sop.standard.choose": "Choose…",
  "sop.standard.noPens": "The farm has no pens yet",
  "sop.standard.noProducts":
    "Nothing on the medicine list may be given yet — the vet writes its withdrawal days first",
  "sop.edit": "Edit",
  "sop.publish": "Publish",
  "sop.propose": "Propose a change",
  "sop.published": "Published version {number}",
  "sop.proposed": "Sent to the owner",
  "sop.name": "Name",
  "sop.purpose": "Purpose",
  "sop.bangla": "Bangla",
  "sop.englishHint":
    "Optional. Cleared when the Bangla is changed, so it never says what the Bangla used to.",
  "sop.englishListHint": "In English, in the same order, comma separated",
  "sop.english": "English (optional)",
  "sop.days": "Days of the week",
  "sop.everyDay": "No day ticked: every day",
  "sop.onTheseDays": "Only on the ticked days",
  "sop.firstOfTheMonth": "The first in the month only",
  "sop.everyOtherWeek": "Every other week (fortnightly)",
  "sop.wholeFarm": "Once for the whole farm, not for each pen",
  "sop.wholeFarmHint":
    "For work about the farm itself — the footbath, the visitor book. Raised once, while any pen has an animal it is for.",
  "sop.weekday.0": "Sun",
  "sop.weekday.1": "Mon",
  "sop.weekday.2": "Tue",
  "sop.weekday.3": "Wed",
  "sop.weekday.4": "Thu",
  "sop.weekday.5": "Fri",
  "sop.weekday.6": "Sat",
  "sop.times": "Times of day",
  "sop.timesHelp": "Comma separated, e.g. 05:00, 16:00",
  "sop.triggers": "What raises this work",
  "sop.trigger.byHand": "Nothing raises this — the manager runs it on the day",
  "sop.trigger.withoutDelay": "The moment it is found, without delay",
  "sop.trigger.add": "Add a trigger",
  "sop.trigger.event": "Something that happened",
  "sop.trigger.state": "An animal's state",
  "sop.trigger.prescription": "A prescription",
  "sop.trigger.perDose": "One piece of work per dose",
  "sop.effect.treatment": "Records a dose given",
  "sop.trigger.after": "Days after",
  "event.move": "A move",
  "event.arrival": "An arrival",
  "sop.assignedRole": "Who does it",
  "sop.checkerRole": "Who signs it off",
  "sop.checkerNone": "Nobody",
  "sop.grace": "Grace (minutes)",
  "sop.effect": "What this step records",
  "sop.effect.product": "Which product",
  "sop.effect.prescriptionNames": "A prescription will name it",
  "sop.effect.none": "Only the evidence itself",
  "sop.effect.feeding": "Feeding the pen its ration",
  "sop.effect.milk_record": "A cow's milk record",
  "sop.effect.bulk_total": "The bulk tank total",
  "sop.effect.move": "Moving the animal to another pen",
  "sop.effect.needsPens": "Make a pen first",
  "sop.steps": "Steps",
  "sop.addStep": "Add a step",
  "sop.stepText": "What to do",
  "sop.repeatPerAnimal": "Once per animal",
  "sop.evidence": "What to record",
  "sop.evidence.tick": "Tick",
  "sop.evidence.number": "Number",
  "sop.evidence.choice": "Choice",
  "sop.evidence.photo": "Photo",
  "sop.evidence.note": "Note",
  "sop.evidence.datetime": "Date and time",
  "sop.unit": "Unit",
  "sop.min": "Least",
  "sop.max": "Most",
  "sop.noLimit": "Empty for no limit",
  "sop.moreAnswers": "Also asks",
  "sop.answerLabel": "What it asks, in Bangla",
  "sop.required": "Required",
  "sop.removeAnswer": "Remove this answer",
  "sop.addAnswer.note": "Ask for a note",
  "sop.addAnswer.photo": "Ask for a photo",
  "sop.draftKept": "You were writing “{name}” on this device",
  "sop.draftCarryOn": "Carry on writing",
  "sop.draftLetGo": "Let it go",
  "sop.draftStay": "Keep writing",
  "sop.draftLeave": "Leave",
  "sop.draftLeaveTitle": "Leave the procedure you are writing?",
  "sop.draftLeaveWhy":
    "It is kept on this device, and the playbook offers it back when you return.",
  "sop.draftLetGoTitle": "Let this draft go?",
  "sop.draftLetGoWhy":
    "What you have written here is not published and will not be kept.",
  "sop.meanings": "What the farm does with these",
  "sop.meaning.heat": "a heat: sends the breeding work",
  "sop.meaning.urgent": "urgent: the manager within the hour",
  "sop.meaning.notFound": "opens a missing animal",
  "sop.meaning.unwell": "the manager sees to her",
  "sop.meaning.nothingToNote": "passed in one tap",
  "sop.meaningLost":
    "“{was}” did this: {means}. Nothing on this step does now.",
  "sop.meaningLostWrite":
    "Write the new words for it, then give it to them here.",
  "sop.meaningGiveTo": "Give it to…",
  "sop.meaningGive": "Same thing, new words",
  "sop.skipReasons": "Skip reasons",
  "sop.skipHelp": "Comma separated, Bangla",
  "sop.proposalBy": "Proposed by {name}",
  "sop.col.proposer": "Proposed by",
  "sop.col.note": "Note",
  "sop.approve": "Approve and publish",
  "sop.reject": "Reject",
  "sop.rejected": "Turned down; the proposer has been told why",
  "sop.rejectWhy.title": "Turn this change down",
  "sop.rejectWhy.description":
    "Whoever proposed it is told, with what you write here.",
  "sop.rejectWhy.label": "Why not?",
  "sop.proposeWhy.title": "Send this change to the owner",
  "sop.proposeWhy.description":
    "The owner reads this beside your change before deciding.",
  "sop.proposeWhy.label": "Why should it change?",
  "sop.outOfDate": "Drafted on version {number}",
  "sop.outOfDateTitle":
    "Drafted on version {drafted}; version {number} is in force now",
  "sop.outOfDateWhy":
    "Approving it would undo what changed since. Turn it down and ask for it again on the version in force.",
  "sop.whatItChanges": "What it changes in version {number}",
  "sop.refused.proposalOutOfDate":
    "The procedure has had a new version since this change was drafted. Turn it down and ask for it again on version {version}.",
  "sop.refused.nameTaken":
    "Another procedure in force has this name, in Bangla or in English. Give this one a name of its own.",
  "sop.refused.standardAdopted":
    "The farm already has this standard procedure in force, under whatever name. Change that one, or retire it first.",
  "sop.refused.changedSinceYouBegan":
    "Version {version} was published while you were writing. Close this and start again from it, so nothing it changed is undone.",
  "sop.noProposals": "No changes waiting",
  "sop.blocker.noSteps": "Add at least one step",
  "sop.blocker.said": "{where}: {what}",
  "sop.problem.other": "this cannot be published as it is",
  "sop.problem.bangla": "write it in Bangla",
  "sop.problem.noEvidence": "say what is recorded",
  "sop.problem.rangeBackwards": "the least is more than the most",
  "sop.problem.noChoices": "write at least one thing to choose",
  "sop.problem.sameValue": "two choices are the same; make each one different",
  "sop.problem.sameId":
    "two steps share the name “{value}”; remove one and add it again",
  "sop.problem.needsFigure": "this step records a figure, so ask for a number",
  "sop.problem.noPen": "choose the pens an animal may be moved to",
  "sop.problem.nothingToSee": "write what may be seen",
  "sop.problem.weanPen": "choose the fattening pen a weaned bull calf goes to",
  "sop.problem.doseProduct":
    "choose the medicine every animal in the pen is given",
  "sop.problem.prescriptionNames":
    "a prescription names its own medicine; choose none here",
  "sop.problem.prescriptionNeedsDose":
    "a prescription raises this work, so add a step that gives the dose",
  "sop.problem.prescriptionOnly":
    "this step gives a prescribed dose, so only a prescription may raise this work",
  "sop.problem.reportNeedsStep":
    "a notifiable disease raises this work, so add a step that records the report delivered",
  "sop.problem.notifiableOnly":
    "this step records a report, so only a notifiable disease may raise this work",
  "sop.problem.oneDose":
    "a procedure gives one dose; split the others into their own procedures",
  "sop.problem.oneDisease":
    "a procedure reports one disease; split the others into their own procedures",
  "sop.problem.lotNoCampaign":
    "a lot number belongs to a campaign, and no step here gives a medicine to the pen",
  "sop.problem.lotFirst": "ask for the lot number before the doses it numbers",
  "sop.problem.lotOnce": "ask for the campaign's lot number in one step only",
  "sop.problem.wholeFarmOnce":
    "work for the whole farm is done once, not animal by animal",
  "sop.problem.wholeFarmNoPen":
    "work for the whole farm has no pen, so it cannot write a pen's or an animal's record",
  "sop.problem.wholeFarmClock":
    "work for the whole farm comes up by the clock, not by what happens in a pen",
  "sop.problem.once": "this is done once, not animal by animal",
  "sop.problem.perAnimal": "this is done animal by animal",
  "sop.problem.shape":
    "its answers are not the ones this kind of step asks; choose what it records again",
  "sop.problem.notATime": "“{value}” is not a time of day; write it like 05:00",
  "sop.problem.notADay": "“{value}” is not a day of the week",
  "sop.problem.notAState": "“{value}” is not a state an animal is in",
  "sop.problem.notALead":
    "“{value}” is not a lead the farm keeps before calving",
  "sop.problem.notAnEvent": "the farm does not record “{value}”",
  "sop.problem.tooFarAhead":
    "no later than {value, plural, one {# day} other {# days}} after",
  "sop.problem.needsTime":
    "write at least one time, or remove the days to raise it by hand",
  "sop.problem.whichDay": "choose the day of the week it falls on",
  "sop.problem.monthlyNotFortnightly":
    "choose monthly or every other week, not both",
  "sop.problem.wholeDays": "write whole days, from none upwards",
  "sop.problem.heatTimed":
    "a heat's work falls in the farm's AI window; leave the days empty",
  "sop.problem.serviceTimed":
    "a service's work falls on the farm's days to a pregnancy check; leave the days empty",
  "sop.problem.pregnancyByService":
    "a pregnancy check is raised by a service and nothing else",
  "sop.problem.grace": "write whole minutes, at most a day (1440)",
  "sop.problem.whoseService": "a service is recorded by the manager",
  "sop.problem.whoseStore": "the store is counted by the manager",
  "sop.problem.whoseMedicine": "the medicine is counted by the manager",
  "sop.problem.whoseCash": "the cash is counted by a manager or the owner",
  "sop.problem.whoseRenewal": "the registration is renewed by the owner",
  "sop.problem.whoseCalving":
    "a calving is recorded by barn staff or the manager",
  "sop.problem.whosePregnancy": "a pregnancy check is the vet's",
  "sop.problem.whoseReport":
    "the report to DLS is taken by the manager or the owner",
  "sop.blocker.whole": "The procedure",
  "sop.cannotPublish": "This cannot be published yet",
  "sop.tab.procedures": "Procedures",
  "sop.tab.proposals": "Proposed changes",
  "sop.kpi.procedures": "Procedures",
  "sop.kpi.proceduresHint": "Published and in force",
  "sop.kpi.waiting": "Changes waiting",
  "sop.kpi.waitingOwner": "Waiting for you to publish or turn down",
  "sop.kpi.waitingManager": "With the owner to decide",
  "sop.kpi.byHand": "Raised by hand",
  "sop.kpi.byHandHint": "No clock or happening raises them",
  "sop.col.when": "When it comes up",
  "sop.byHand": "Raised when the farm needs it",
  "sop.checkedBy": "Signed off by: {role}",
  "sop.rowActions": "{name} — more actions",
  "sop.search": "Find a procedure by name",
  "sop.noMatch": "No procedure has that name",
  "sop.retire": "Retire",
  "sop.retired": "Retired",
  "sop.restore": "Restore",
  "sop.inForceNow": "In force",
  "sop.showing": "Which procedures",
  "sop.retireTitle": "Retire {name}?",
  "sop.retireWhy":
    "The farm stops raising its work. Work nobody has started is called off; work somebody has taken is theirs to finish. Its versions, its card and everything done under it are kept, and it can be restored.",
  "sop.retiredDone":
    "Retired — {count, plural, one {# piece of work} other {# pieces of work}} called off",
  "sop.restored": "Restored — its work is raised again the next time it is due",
  "sop.refused.retired":
    "This procedure has been retired. Restore it before changing it",
  "sop.refused.treatmentExists":
    "The farm already has a procedure a prescription raises. Retire that one first",
  "sop.refused.reportExists":
    "The farm already has a procedure a notifiable disease raises. Retire that one first",
  "card.retiredHint": "The farm no longer raises this work",
  "sop.withTheOwner": "With the owner",
  "sop.readProposal": "Read the proposed change",
  "sop.inForce": "Version {number} in force now",
  "sop.stepNumber": "Step {number}",
  "sop.removeStepNumber": "Remove step {number}",
  "sop.moveStepUp": "Move step {number} up",
  "sop.previewStep": "See how the phone shows step {number}",
  "sop.previewTitle": "Step {number} on the phone",
  "sop.previewHint":
    "What the shed will see, from the phone's own screen. Nothing you answer here is recorded.",
  "sop.previewNothingRecorded": "A preview: nothing was recorded",
  "sop.previewFromTheFarm":
    "On the phone this step also lists what the farm holds — the pen's ration, the store, the registration. The preview cannot show those lines.",
  "sop.moveStepDown": "Move step {number} down",
  "sop.removeStep": "Remove step",
  "sop.removeStepTitle": "Remove step {number}, “{words}”?",
  "sop.removeStepWhy":
    "Its words and what it asks go with it. Nothing is published until you publish.",
  "sop.setByEffect": "Set by what this step records",
  "sop.trigger.removeNumber": "Remove what raises it, number {number}",
  "sop.editor.details": "About this procedure",
  "sop.editor.detailsHint":
    "Its name and why it is done, in Bangla. English is optional.",
  "sop.editor.when": "When it comes up",
  "sop.editor.whenHint":
    "On the clock, when something the farm records happens, or both. Neither, and the manager raises it on the day.",
  "sop.editor.clock": "On the clock",
  "sop.editor.who": "Who does it and who signs it off",
  "sop.editor.whoHint":
    "The Role the work is given to, the Role that checks it, and how late it may run.",
  "sop.editor.stepsHint":
    "In the order they are done. Each step says what is recorded.",
  "sop.editor.noSteps": "No steps yet — add the first",
  "sop.editor.ready": "Ready",
  "sop.editor.blocked":
    "{count, plural, one {# thing} other {# things}} to put right",
  "sop.editor.publishHint": "Publishing makes a new version of this procedure.",
  "sop.editor.proposeHint":
    "Your change goes to the owner, who publishes it or turns it down.",
  "card.title": "SOP card",
  "card.pageHint":
    "The procedure as it goes on the shed wall, in Bangla, made from its published version. Print it on one A4 sheet.",
  "card.version": "Version {number} · {date}",
  "card.purpose": "Why",
  "card.who": "Who does it",
  "card.when": "When",
  "card.perAnimal": "Once per animal",
  "card.upTo": "up to {most}",
  "card.from": "from {least}",
  "card.gives": "Gives {product}",
  "card.choices": "Choose from: {choices}",
  "card.checker": "Checked by",
  "card.where": "Where",
  "card.eachPen": "Each pen with animals",
  "card.wholeFarm": "Once for the whole farm",
  "card.whenNeeded": "When needed",
  "card.steps": "Steps",
  "card.skippable": "May be skipped if",
  "card.madeFrom":
    "Made from the published version: the card on the wall and the work in the app are the same.",
  "training.title": "Who has been trained",
  "training.mark": "Mark as trained",
  "training.none": "Nobody has been marked yet",
  "training.on": "Version {number} · {date}",
  "training.hint":
    "Mark somebody once they have been taught from this card's version.",
  "training.who": "Who was taught",
  "training.current": "Knows the version in force",
  "training.behind": "Needs teaching version {number}",
  "changed.title": "This procedure has changed",
  "changed.versions": "Version {from} to {to}",
  "changed.onOlder": "This work is running on version {number}",
  "changed.step_added": "New step: {step}",
  "changed.step_removed": "Step removed: {step}",
  "changed.step_reworded": "Reworded: {step}",
  "changed.step_evidence": "What is recorded has changed: {step}",
  "changed.step_skip_reasons": "Skip reasons changed: {step}",
  "changed.step_per_animal": "Now once per animal: {step}",
  "changed.step_effect": "What this step records has changed: {step}",
  "changed.steps_reordered": "The order of the steps has changed",
  "changed.purpose_changed": "The purpose has changed",
  "changed.times_changed": "Times changed: {times}",
  "changed.grace_changed":
    "Grace is now {minutes, plural, one {# minute} other {# minutes}}",
  "changed.who_changed": "Now done by: {role}",
  "changed.now_whole_farm":
    "Now raised once for the whole farm, not for each pen",
  "changed.now_per_pen":
    "Now raised for each pen with animals, not once for the farm",
  "changed.checker_changed": "Now signed off by: {role}",
  "alerts.sopProposed": "{sop} — a change proposed",
  "alerts.sopRetired": "{sop} was retired — its work is no longer raised",
  "alerts.sopRestored": "{sop} was restored — its work is raised again",
  "alerts.sopPublished": "{sop} — new version {number}",
  "common.pages": "Pages",
  "common.pager": "{from}–{to} of {total}",
  "common.previousPage": "Previous page",
  "common.nextPage": "Next page",
  "common.col.actions": "Actions",
  "common.col.details": "Details",
  "form.notReady": "Not everything this needs is given yet.",
  "form.discardTitle": "Close without saving?",
  "form.discardWhy": "What you typed has not been saved yet.",
  "form.keepEditing": "Keep editing",
  "form.discard": "Close without saving",
  "common.selectPage": "Select every row on this page",
  "common.showDetails": "Show details",
  "common.hideDetails": "Hide details",
  "passwordAgain.title": "Your password, please",
  "passwordAgain.why":
    "Paying money out, approving money, opening the portal and copying an investor's data ask for it again after a quarter of an hour.",
  "passwordAgain.label": "Password",
  "passwordAgain.give": "Go on",
  "passwordAgain.wrong": "That is not your password.",
  "passwordAgain.slowed":
    "Too many wrong passwords. Wait a minute and try again.",
  "passwordAgain.notGiven": "Not done: it needs your password.",
  "common.noSignalNotSaved":
    "No signal: this was not saved. It is still here — save again when the phone has signal.",
  "common.figureRefused":
    "The farm will not take what was typed: look at each box and try again",
  "common.cannotKeepWork":
    "This phone cannot keep work, so nothing was recorded: open the app in its own browser, not a private window",
  "work.correctionKept":
    "Put right on this phone. It goes to the farm when the phone has signal.",
  "common.cancel": "Cancel",
  "papers.languageSwitch": "The paper's language",
  "common.close": "Close",
  "common.messages": "Messages",
  "nav.signOff": "Review",
  "nav.backups": "Backups",
  "nav.settings": "Your settings",
  "feed.subtitle":
    "What is in the store, what came in, and which ration each pen is on.",
  "feed.tab.stock": "Store",
  "feed.tab.feedIn": "Came in",
  "feed.tab.counts": "Counts",
  "feed.tab.rations": "Rations",
  "feed.tab.items": "Feed items",
  "feed.tab.leftovers": "Leftovers",
  "leftovers.summary":
    "In the last {days, plural, one {# day} other {# days}} the pens left feed worth {worth} uneaten.",
  "leftovers.hint":
    "What each pen left of each feed, and what it cost. More than {percent}% left means the ration gives more of it than they eat.",
  "leftovers.period": "Days to read",
  "leftovers.days": "{days, plural, one {# day} other {# days}}",
  "leftovers.none": "No feeding was written down in these days.",
  "leftovers.col.pen": "Pen",
  "leftovers.col.feed": "Feed",
  "leftovers.col.given": "Given",
  "leftovers.col.left": "Left over",
  "leftovers.col.worth": "What it cost",
  "leftovers.col.standing": "Standing",
  "leftovers.share": "{percent}% left",
  "leftovers.sessions":
    "Some left at {left} of {sessions, plural, one {# feeding} other {# feedings}}",
  "leftovers.unpriced": "Not priced",
  "leftovers.standing.wasting": "Given too much",
  "leftovers.standing.all_eaten": "Nothing ever left",
  "leftovers.standing.fine": "Fine",
  "leftovers.standing.too_few": "Too few feedings",
  "leftovers.why.wasting": "Give less of it in {ration}",
  "leftovers.why.wastingNoRation": "Give less of it",
  "leftovers.why.all_eaten":
    "They may want more — or nobody is writing the leftovers down",
  "feed.kpi.items": "Feed items in store",
  "feed.kpi.itemsHint": "Being fed now",
  "feed.kpi.low": "Running low",
  "feed.kpi.lowHint":
    "Below their level, short of days, or out of a feed a pen is on",
  "feed.kpi.value": "Store value",
  "feed.kpi.valueHint": "At average price",
  "feed.kpi.bought": "Bought this month",
  "feed.kpi.boughtHint": "{count, plural, one {# lot} other {# lots}}",
  "feed.itemsDescription":
    "What the farm feeds. A retired feed item stays named in the rations that fed it.",
  "feed.rationsDescription":
    "Each ration is a day's feed — each line for every animal, or for every 100 kg it weighs. Choose here which pen is on which.",
  "feed.targetDescription":
    "This session's feed for the pen you choose, worked out from the animals standing in it.",
  "feed.editRation": "Edit ration",
  "feed.inUse": "In use",
  "feed.col.status": "Status",
  "feed.items": "Feed items",
  "feed.addItem": "Add a feed",
  "feed.retire": "Retire",
  "feed.atMostADay": "No more than {kg} a day",
  "feed.retiredLine": "This feed is retired: empty its line to save the ration",
  "feed.retired": "Retired",
  "feed.restore": "Restore",
  "feed.rename": "Rename",
  "feed.renameTitle": "Rename {name}",
  "feed.renameHint":
    "Every ration, purchase and count of this feed takes the new name.",
  "feed.addStandard": "Add the standard feeds",
  "feed.addStandardTitle":
    "Add {count, plural, one {# standard feed} other {# standard feeds}}?",
  "feed.addStandardHint":
    "These are added: {names}. What they cost, how much is in the store and what their bags weigh stay yours to set.",
  "feed.addedStandard": "{count, plural, one {# feed} other {# feeds}} added",
  "feed.rationActions": "What to do with {name}",
  "feed.retireRationBusy":
    "Pens are fed on it — put them on another ration first",
  "feed.retiredRations": "Retired rations ({count})",
  "feed.retiredRationsHint":
    "Kept so past feedings still read by name. Bring one back to put a pen on it.",
  "feed.rationRetired": "Ration retired",
  "feed.rationRestored": "Ration restored",
  "feed.pen": "Pen",
  "feed.noRation": "This pen has no ration",
  "feed.setRation": "Save the ration",
  "feed.rationName": "Ration name",
  "feed.kgPerAnimal":
    "How much a day — for each animal, or for every 100 kg it weighs",
  "feed.basis.head": "a head",
  "feed.band": "For animals weighing",
  "feed.bandFrom": "From",
  "feed.bandTo": "Up to",
  "feed.bandHint":
    "Leave both empty for a ration that suits any weight. A bull outside the band is pointed out on the Fattening page.",
  "feed.bandWrong": "Both weights above nothing, and From below Up to",
  "feed.bandRange": "{from}–{to} kg",
  "feed.bandFromOnly": "from {from} kg",
  "feed.bandToOnly": "under {to} kg",
  "band.title": "In the wrong pen for their weight",
  "band.hint":
    "Weighed outside the band of their pen's ration. Move each to a pen whose ration suits his weight.",
  "band.outgrown": "Outgrown",
  "band.tooLight": "Too light",
  "band.inPen": "In {pen} · {ration} ({band})",
  "band.moveTag": "Move {tag}",
  "band.fitsIn": "Suits: {pens}",
  "band.noPenFits": "No pen's ration suits this weight yet",
  "band.showAll": "Show all {count}",
  "feed.expectedGain": "Expected gain, kg a day",
  "feed.expectedGainLow": "Low",
  "feed.expectedGainHigh": "High",
  "feed.expectedGainHint":
    "What a bull eating this ration should put on a day, low to high. One gaining under the low figure is listed on the Fattening page. Leave both empty for none.",
  "feed.expectedGainBoth": "Fill in both figures, or neither.",
  "feed.expectedGainRange": "{low}–{high} kg/day",
  "standards.subtitle":
    "What the app's standard figures are worked from, and the published guides to open when one is questioned.",
  "standards.usesTitle": "What the app works from",
  "standards.usesHint":
    "No Bangladeshi, BLRI, DLS or FAO guide says what a fattening ration should put on a bull. These figures are worked from the trials and feeding standards below, for a settled crossbred bull, and are yours to replace with your own in the ration editor.",
  "standards.col.ration": "Standard ration",
  "standards.col.band": "For animals weighing",
  "standards.col.gain": "Expected gain",
  "standards.col.firmness": "How firm",
  "standards.firmness.medium": "Medium",
  "standards.firmness.mediumLow": "Medium-low",
  "standards.firmness.low": "Low",
  "standards.settling": "Settling in",
  "standards.settlingDays":
    "{days, plural, one {# day} other {# days}} after a bull arrives, before his gain is judged",
  "standards.readOver": "Gain read over",
  "standards.readOverDays":
    "at least {days, plural, one {# day} other {# days}} of weigh-ins — your setting",
  "standards.deshi": "Deshi animals",
  "standards.breedShare": "A breed's own share",
  "standards.breedShareRule":
    "Where the farm has set a breed's own share from what its own bulls of it put on, that share replaces the standard figure and the deshi share for it — set on the breeds page.",
  "standards.female": "Cows and heifers",
  "standards.shareSet": "{percent}% of a ration's expected gain — your setting",
  "standards.penmates": "Behind his penmates",
  "standards.penmatesRule":
    "under {percent}% of his pen's middle gain, once {count, plural, one {# animal} other {# animals}} in it are weighed — your setting",
  "standards.ownFigures": "Your own figures",
  "standards.ownFiguresFrom":
    "shown once {count, plural, one {# animal} other {# animals}} of a kind have a gain",
  "standards.group.bangladesh": "From Bangladesh",
  "standards.group.feeding": "Feeding standards",
  "standards.group.weighing": "Weighing and settling in",
  "standards.group.breeding": "Breeding and milk",
  "standards.checked": "Every link was opened and working on {date}.",
  "standards.link": "Where these figures come from",
  "farmGains.yourFarm": "Your farm",
  "farmGains.group.cross": "crossbred bulls",
  "farmGains.group.deshi": "deshi bulls",
  "farmGains.group.unrecorded": "bulls, breed not recorded",
  "farmGains.group.female": "crossbred cows and heifers",
  "farmGains.figure": "{group} {gain} ({count})",
  "farmGains.offer":
    "Your crossbred bulls on this ration, middle half: {range} ({count})",
  "farmGains.use": "Use it",
  "farmGains.deshiShare":
    "On {ration}, your deshi bulls put on {percent}% of what your crossbred bulls did.",
  "farmGains.femaleShare":
    "On {ration}, your cows and heifers put on {percent}% of what your crossbred bulls did.",
  "gainOnRation.title": "Gaining less than they should",
  "gainOnRation.hint":
    "Over at least the last {days, plural, one {# day} other {# days}} of weigh-ins, these put on less a day than their pen's ration is written for, lost weight, or fell well behind their penmates. Look at each one: worms or liver fluke, teeth, feet, or whether he gets his share at the trough.",
  "gainOnRation.losing": "Losing weight",
  "gainOnRation.underPenmates": "Behind his penmates",
  "gainOnRation.penmates":
    "His penmates' middle, for an animal like him: {gain} ({count})",
  "gainOnRation.penmatesShort": "penmates {gain}",
  "gainOnRation.under": "Under the ration",
  "gainOnRation.within": "As the ration should",
  "gainOnRation.over": "Above the ration",
  "gainOnRation.gained":
    "{gain} over {days, plural, one {# day} other {# days}} · {from} to {to}",
  "gainOnRation.expects": "In {pen} · {ration} should give {range}",
  "gainOnRation.expectsShort": "Should give {range}",
  "gainOnRation.forDeshi": "deshi, {percent}%",
  "gainOnRation.forBreed": "its breed's own {percent}%",
  "gainOnRation.forFemale": "female, {percent}%",
  "gainOnRation.breedUnknown": "breed not recorded",
  "gainOnRation.outsideBand": "Not judged: outside this ration's weights",
  "feed.basis.weight": "per 100 kg body weight",
  "feed.basisOf": "How {item} is counted",
  "feed.perHundred": "{amount} {unit} per 100 kg",
  "feed.workingByWeight":
    "{perHundred} {unit} per 100 kg × {weight} kg ÷ {sessions} a day",
  "feed.herdWeight": "The pen weighs {weight} kg — {weighed} weighed",
  "feed.herdUnweighed": "{unweighed} not weighed, counted at the average",
  "feed.herdOldest":
    "oldest weight {days, plural, one {# day} other {# days}} old",
  "feed.weighFirst": "Weigh the pen first",
  "work.typeWhatWentOut":
    "Nobody in this pen has been weighed, so this has no target — type what you gave.",
  "feed.rations": "Rations",
  "feed.newRation": "New ration",
  "feed.assign": "Put this pen on it",
  "feed.assigned": "This pen is on it",
  "feed.english": "English (optional)",
  "feed.unit": "Unit",
  "feed.bagSize": "Bag size",
  "feed.bagOf": "{kg} kg bags",
  "feed.setBagSize": "Bag size",
  "feed.bagSizeHint":
    "What one of its bags weighs, so an arrival can be written in bags. Leave it blank if it is not bought by the bag.",
  "feed.itemActions": "What to do with {name}",
  "feed.version": "Version {number}",
  "feed.pensOn": "On {count, plural, one {# pen} other {# pens}}",
  "feed.target": "This session's target",
  "feed.working":
    "{headcount, plural, one {# animal} other {# animals}} × {perAnimal} {unit} ÷ {sessions} a day",
  "feed.noItems": "Add a feed item first",
  "stock.recordArrival": "Record feed in",
  "stock.sheetDescription":
    "Put feed bought, or cut from the farm's own land, into the store. A purchase's price goes to the money register.",
  "stock.status.low": "Running low",
  "stock.status.out": "Nothing left",
  "stock.status.ok": "Enough",
  "stock.status.unwatched": "No level set",
  "stock.col.status": "Status",
  "stock.col.value": "Value",
  "stock.col.lowAt": "Running-low level",
  "stock.rowActions": "{name} — more actions",
  "stock.setFodderPrice": "What it is worth home-grown",
  "stock.fodderPriceSaved": "What home-grown fodder is worth is saved",
  "stock.fodderPriceHint":
    "What a unit of this is worth when the farm grows it itself — roughly what buying it would cost. Every cut from here on comes into the store at it, so the animals that eat it are charged for it. Blank for anything the farm does not grow.",
  "stock.perUnit": "{currencySign} per {unit}",
  "stock.setLevel": "Set running-low level",
  "stock.levelHint":
    "The manager and the owner are told when the store falls below this. Leave it blank to not be told.",
  "stock.levelSaved": "Level saved",
  "stock.allItems": "All feed items",
  "stock.filterItem": "Filter by feed item",
  "stock.olderNotShown":
    "Only the newest {count} are shown. Choose a feed to see its older ones",
  "stock.olderOfOneNotShown": "Only the newest {count} of this feed are shown",
  "stock.noPriceYet": "No price yet",
  "stock.harvestUnpriced":
    "What this home-grown fodder is worth is not set yet. The cut is kept, and priced when the owner sets it",
  "stock.noArrivals": "Nothing has come in yet",
  "stock.noCounts": "No counts yet",
  "stock.noStock": "Nothing in the store — add a feed item first",
  "stock.adjustment": "expected {expected}, counted {counted}",
  "stock.averagePrice": "{currencySign}{amount} per {unit}",
  "stock.weighed": "Weighed on the farm's scale",
  "stock.weighedHint":
    "Optional. Weigh the lot as it comes: the scale is what goes into the store, and the slip is kept beside it.",
  "stock.scaleShort":
    "The slip says {slip} kg, the scale {weighed} kg — {short} kg short ({percent}%)",
  "stock.scaleOver":
    "The slip says {slip} kg, the scale {weighed} kg — {over} kg over",
  "stock.scaleSame": "The scale agrees with the slip",
  "stock.slipSaid": "slip said {slip} kg",
  "stock.shortOnScale": "{kg} kg short",
  "stock.overOnScale": "{kg} kg over",
  "scale.title": "Short on the scale, last 90 days",
  "scale.hint":
    "From the lots weighed as they came: each seller's slips against the farm's scale. A lot nobody weighed claims nothing.",
  "scale.none":
    "No lot has been weighed in the last 90 days. Weigh one as it comes to see how short each seller runs.",
  "scale.lots": "{count, plural, one {# lot weighed} other {# lots weighed}}",
  "scale.slipAndScale": "slips {slip} kg · scale {weighed} kg",
  "stock.lastBought": "Last bought at {currencySign}{amount} per {unit}, {day}",
  "stock.dearer": "{percent}% dearer than last time",
  "stock.cheaper": "{percent}% cheaper than last time",
  "stock.sameAsLast": "the same as last time",
  "stock.kind": "Bought or harvested",
  "stock.purchase": "Bought",
  "stock.harvest": "From our own fields",
  "stock.howMuch": "How much",
  "stock.quantity": "How much ({unit})",
  "stock.maunds": "about {maunds, plural, one {# maund} other {# maunds}}",
  "stock.boughtAs": "bought as {count} {pack}",
  "stock.comesTo": "{quantity} {unit} in all",
  "stock.countedIn": "Counted in",
  "stock.bagHolds": "One bag holds {kg} kg",
  "stock.price": "What it cost in all ({currencySign})",
  "stock.seller": "Bought from",
  "stock.receivedOn": "The day it came in",
  "stock.record": "Record it coming in",
  "stock.received": "Recorded",
  "stock.col.item": "Feed item",
  "stock.col.onHand": "On hand",
  "stock.col.daysLeft": "Days left",
  "stock.daysLeft": "{days, plural, one {# day} other {# days}}",
  "stock.daysLeftLine":
    "{days, plural, one {# day} other {# days}} left at {perDay} {unit} a day",
  "home.lowStockDays":
    "{feed}: {onHand} {unit} left — {days, plural, one {# day} other {# days}} at the rate it is fed",
  "stock.col.averagePrice": "Average price",
  "stock.col.expected": "Expected",
  "stock.col.counted": "Counted",
  "stock.col.countedBy": "Counted by",
  "stock.col.quantity": "How much",
  "refusal.purchaseNeedsPriceAndSeller":
    "A purchase needs what it cost and who sold it",
  "refusal.harvestHasNoPrice": "A harvest from our own fields has no price",
  "refusal.receivedInTheFuture":
    "Feed cannot come in on a day that has not come yet",
  "refusal.ventureWrongState":
    "The venture is not where it would have to be for that",
  "refusal.venturePastDecideBy": "Its decide-by day has passed",
  "refusal.ventureNotShown": "It is not shown in the portal",
  "refusal.unitsBeyondAsked": "More units than they asked for",
  "refusal.unitsBeyondPromisable": "More units than are left to promise",
  "refusal.requestAlreadyAnswered": "This request has been answered already",
  "refusal.requestNotLive": "This request is no longer waiting",
  "refusal.requestNotTheirs":
    "This request is another investor's, or on another venture",
  "refusal.noSuchRequest": "There is no such request",
  "refusal.ventureUnderFloor":
    "The venture holds less than the floor it was opened on",
  "refusal.ventureFloorOverTarget":
    "The floor cannot be more than the capital the venture is after",
  "refusal.ventureFloorOverUnits":
    "The floor is more than the units can ever raise: lower it, or add units",
  "refusal.ventureNoMonthToPayIn":
    "No 10th falls between the month after the decision date and the sale window: move a date, or have it paid before buying",
  "refusal.ventureNothingToPayMonthly":
    "The cattle budget is all the capital, so nothing is left to pay by the month",
  "refusal.ventureBudgetOverCapital":
    "The cattle budget cannot be more than the capital it comes from",
  "refusal.ventureUnitsGone": "The venture has fewer units left than that",
  "refusal.investorCapReached":
    "The farm already has as many investors as it may have at a time",
  "refusal.investorExists":
    "An investor of this name is written down already, on that same phone number",
  "refusal.organizationNamesNoNominee":
    "An organization names no nominee: its share is its own",
  "refusal.investorIsAPerson": "Only an organization has a signatory to change",
  "refusal.investorKindFixed":
    "A person stays a person and an organization an organization. Retire this one and write them down again.",
  "refusal.investorAlreadySigned":
    "This investor has signed for this venture already",
  "refusal.expiredWhenBought": "That lot had expired before it came in",
  "refusal.noFarmLossToCover":
    "This venture made no loss for the farm to carry",
  "refusal.investorRetired":
    "This investor is retired; restore them from the Investors page first",
  "refusal.rationInUse":
    "Pens are still fed on this ration. Put them on another ration first.",
  "refusal.rationRetired":
    "That ration is retired. Restore it to put a pen on it.",
  "refusal.investorStillIn":
    "Their money is in a venture still running; they can be retired once it settles or is called off",
  "refusal.capitalMustBeByBank":
    "A venture takes money by bank only — a transfer, a check or a deposit slip",
  "refusal.agreementHasNoPaper":
    "The photo of the stamped agreement has to be on file before its money is",
  "refusal.capitalNotSentBack":
    "Every {currencyOne} the venture took needs a refund with its own reference",
  "refusal.neverTheAnimals":
    "Wages, shed rent, utilities, repairs, shed hygiene, equipment and money coming in are never charged to the animals",
  "refusal.neverMonthly":
    "Only money going out that no record books may be marked as paid every month",
  "refusal.wagesWatchedByPerson":
    "A wage is looked for by the person paid, not by the category",
  "refusal.rationNotSaved":
    "This ration cannot be saved as written: check each amount, its weights and its expected gain",
  "refusal.feedRetired": "{feed} is retired: take it out, or restore it first",
  "refusal.bagSizeUnknown":
    "Say what one of its bags weighs first, on the Feed items tab",
  "refusal.bundlesByTheHead":
    "{feed} is counted in bundles, so it goes by the head, not by body weight",
  "refusal.packNeedsKg": "Only feed weighed in kilos comes in bags or maunds",
  "nav.feed": "Feed",
  "nav.standards": "Standards and sources",
  "nav.milk": "Milk",
  "dispatch.subtitle":
    "The day's tank beside what went out of the gate, and the records a processor or BFSA asks for.",
  "dispatch.intoTank": "Into the tank",
  "dispatch.handedOver": "Handed over",
  "dispatch.noneThatDay": "No milk handed over that day",
  "dispatch.day": "Day",
  "dispatch.liters": "liters",
  "dispatch.whenLeft": "When it left",
  "dispatch.when": "When it left (empty: now)",
  "dispatch.litersField": "Liters",
  "dispatch.buyer": "Buyer",
  "dispatch.buyerAddress": "Buyer's address",
  "dispatch.buyerPhone": "Buyer's phone",
  "dispatch.deliveryNote": "Delivery note number",
  "dispatch.price": "Price per liter ({currencySign})",
  "dispatch.fat": "Fat %",
  "dispatch.snf": "SNF %",
  "dispatch.note": "Note",
  "dispatch.save": "Record it",
  "dispatch.recorded": "Recorded",
  "dispatch.reports": "Records",
  "dispatch.from": "From",
  "dispatch.to": "To",
  "dispatch.recordPaper": "Dispatch record",
  "dispatch.recordHint":
    "Every dispatch with the buyer's name and address and the delivery note: what a processor or BFSA asks for.",
  "dispatch.production": "Milk production",
  "dispatch.productionHint":
    "Liters by day, session, pen and destination, with milk poured away under a withdrawal shown apart, for your own spreadsheet.",
  "dispatch.recordAction": "Record milk handed over",
  "dispatch.sheetDescription":
    "Milk from the tank handed to a buyer. Its price goes to the money register.",
  "dispatch.worth":
    "{liters, plural, one {# liter} other {# liters}} × {currencySign}{price} = {currencySign}{amount}",
  "dispatch.dayBefore": "Day before",
  "dispatch.dayAfter": "Day after",
  "dispatch.tab.mismatches": "Tank mismatches",
  "dispatch.kpi.handedOverHint":
    "{count, plural, one {# dispatch} other {# dispatches}} · {currencySign}{amount}",
  "dispatch.kpi.mismatchesHint": "Waiting for you to look",
  "dispatch.reportsHint": "Choose the dates; each record below covers them.",
  "refusal.dispatchedInTheFuture": "Milk cannot have left later than now",
  "refusal.periodTooLong":
    "One report covers two years at most: the longest year the farm can have",
  "nav.ventures": "Ventures",
  "nav.money": "Income and expenses",
  "money.subtitle":
    "Every {currencyOne} in and out, as the farm's own records made it — and what waits for the owner's approval.",
  "money.period": "Period",
  "money.thisFinancialYear": "This financial year",
  "money.lastFinancialYear": "Last financial year",
  "money.totalIn": "Money in",
  "money.totalOut": "Money out",
  "money.net": "Net",
  "money.awaitingCount": "Awaiting approval",
  "money.register": "Money register",
  "money.col.date": "Date",
  "money.col.what": "What",
  "money.col.with": "With",
  "money.col.status": "Status",
  "money.col.amount": "Amount",
  "money.approved": "Approved",
  "money.allCategories": "All categories",
  "money.anyStatus": "Any status",
  "money.search": "Search who, what or a note",
  "byHand.hint": "For money no other record makes: wages, dung sold, repairs.",
  "money.partialTotals": "These totals cover only the entries shown",
  "money.partialHint":
    "The period has more entries than one page. Narrow the period, or use the accountant's report for complete totals.",
  "money.shownOnly": "Entries shown only",
  "farmAccounts.title": "Farm accounts",
  "farmAccounts.why":
    "The farm's own mobile money numbers and bank accounts. Once one of a kind is listed, money by it names which one it went into or came out of, with its transaction ID.",
  "farmAccounts.none": "No accounts listed yet.",
  "farmAccounts.kind": "Kind",
  "farmAccounts.name": "Name",
  "farmAccounts.number": "Number",
  "farmAccounts.bank": "Bank",
  "farmAccounts.branch": "Branch",
  "farmAccounts.add": "Add account",
  "farmAccounts.added": "Account added",
  "farmAccounts.retire": "Retire",
  "farmAccounts.retired": "retired",
  "farmAccounts.retiredDone": "Account retired",
  "farmAccounts.retireTitle": "Retire {name}?",
  "farmAccounts.retireWhy":
    "No new money can be written to it. Money already written keeps its name, and you can bring it back.",
  "farmAccounts.bringBack": "Bring back",
  "farmAccounts.broughtBack": "Account brought back",
  "farmAccounts.readHint":
    "The balance the statement shows at the month's last day",
  "farmAccounts.outOnHome": "Statements that did not agree",
  "farmAccounts.check": "Check the statement",
  "farmAccounts.neverRead": "No statement read yet",
  "farmAccounts.heldNow": "The farm's books say {currencySign}{amount} now",
  "farmAccounts.lastRead": "last read {month}",
  "farmAccounts.disagrees":
    "The statement did not agree for {months} — say what you found out",
  "farmAccounts.stale":
    "The statement needs reading again for {months} — the farm changed its mind about those months",
  "farmAccounts.checkHint":
    "Hold what {account}'s statement read at the month's end against the farm's books. Where it does not agree, write what you found out.",
  "farmAccounts.firstReading":
    "This account's first statement: what it reads is what the account held, and every month after is checked from it.",
  "money.referenceWas": "ref. {reference}",
  "money.paidBy": "Paid by",
  "money.whichAccount": "Which farm account",
  "money.chooseAccount": "Choose an account",
  "money.reference": "Transaction ID or reference",
  "money.method.cash": "Cash",
  "money.method.mobile_money": "Mobile money",
  "money.method.bank": "Bank",
  "money.approve": "Approve",
  "money.awaiting": "awaiting approval",
  "money.approvedBy": "approved by {name}",
  "money.none": "No money recorded in this period",
  "money.from.dispatch": "Dispatch",
  "money.from.intake": "Intake",
  "money.from.buyingTrip": "Buying trip",
  "money.from.sellingTrip": "Selling trip",
  "money.from.saleBroker": "Broker at a sale",
  "money.from.wageDraw": "Wage draw",
  "selling.trip": "The outing",
  "selling.tripHint":
    "What the day at the livestock market cost beyond the animals. Tick every beast that stood on the lorry — the ones that came home again paid for their place too.",
  "selling.wentTo": "Where it went",
  "selling.transport": "Lorry, both ways",
  "selling.keep": "Stall, food and lodging",
  "selling.wentOn": "The day it went",
  "selling.soldThatDay": "Sold that day",
  "selling.noPen": "In no pen",
  "selling.whoWent": "Who went",
  "selling.nobodyToTake": "No animal on the fattening side to take",
  "selling.recordTrip": "Record the outing",
  "selling.tripRecorded": "The outing is written up",
  "selling.pastTrips": "Outings lately",
  "selling.shrink": "Those sold lost {percent}% on the way ({kg} kg)",
  "selling.tookAnimals": "{count} taken",
  "selling.chosen":
    "{count, plural, one {# animal chosen} other {# animals chosen}}",
  "selling.takeAllSold": "Take them all",
  "selling.leaveAllSold": "Leave them all",
  "selling.takePen": "Take the pen",
  "selling.leavePen": "Leave the pen",
  "money.from.sale": "Sale",
  "money.from.feedIn": "Feed purchase",
  "money.from.medicinePurchase": "Medicine purchase",
  "money.from.vetFee": "Vet fee",
  "money.from.internalSaleIn": "Sold to a venture",
  "money.from.internalSaleOut": "Bought from a venture",
  "money.from.reimbursement": "Reimbursed by a venture",
  "money.from.farmShare": "The farm's share of a venture",
  "money.from.farmLoss": "The farm's share of a venture's loss",
  "money.from.ventureMadeGood": "A venture's lost animal made good",
  "money.from.ventureCapitalOut": "The farm's capital into a venture",
  "money.from.ventureCapitalBack": "The farm's capital back from a venture",
  "money.from.ventureCapitalReturn": "The farm's return on its own capital",
  "money.from.settlementAdjustment": "A settlement adjustment",
  "owner.enteredBy": "entered by {name}",
  "owner.inPieces":
    "under the line alone, past it with this week's other pieces to the same person",
  "owner.moneyAwaiting": "Money awaiting your approval",
  "drugs.buy": "Medicine bought",
  "drugs.quantity": "How much (as on the box)",
  "drugs.doses": "About how many doses",
  "drugs.price": "Price ({currencySign})",
  "drugs.seller": "Bought from",
  "lots.lotNumber": "Lot number",
  "lots.expiresOn": "Expiry date",
  "lots.expiresOnHint":
    "As printed on the box: the store is warned before it, and a dose given after it is said of",
  "lots.feedExpiresOnHint":
    "Where the bag prints one; hay and harvests have none",
  "lots.expired": "Expired",
  "lots.expiresSoon": "Expires soon",
  "lots.col.lot": "Lot and expiry",
  "drugs.col.stock": "In stock",
  "drugs.expiredOnHand":
    "{doses, plural, one {# dose past its day} other {# doses past their day}}",
  "drugs.col.level": "Low-stock level",
  "drugs.col.lastBought": "Last bought",
  "stock.expiredLeft": "{quantity} {unit} past its day",
  "stock.col.lastIn": "Last came in",
  "drugs.countedDifference": "Doses the counts found against the book: {doses}",
  "drugs.dosesOnHand": "{doses, plural, one {# dose} other {# doses}}",
  "drugs.runningLow": "Running low",
  "drugs.setLowStock": "Set the low-stock level",
  "drugs.whatWasBought": "What was bought",
  "drugs.lowStockHint":
    "Below this many doses the store says it is running low. Leave it blank to watch nothing.",
  "drugs.lowStockSaved": "The level is saved",
  "drugs.lowStockLabel": "Doses",
  "lots.col.left": "Left",
  "stock.col.nextExpiry": "First to expire",
  "drugs.boughtOn": "Bought on",
  "drugs.recordPurchase": "Record the purchase",
  "drugs.bought": "Purchase recorded",
  "drugs.dosesHeld": "{doses, plural, one {# dose} other {# doses}}",
  "vetFee.title": "My visit fee",
  "vetFee.amount": "Fee ({currencySign})",
  "vetFee.visitedOn": "Visit day",
  "vetFee.animals": "Animals seen (tags)",
  "vetFee.note": "Note",
  "vetFee.record": "Record the fee",
  "vetFee.recorded": "Fee recorded",
  "vetFee.hint": "The only money you enter here, and the only money you see.",
  "vetFee.none": "No fee recorded yet",
  "vetFee.noAnimals": "No animal on the farm yet to say the vet saw",
  "vetFee.correct": "Put it right",
  "vetFee.correctHint":
    "The fee, the day of the visit or the note. Its money follows; the animals it was charged to stay as named.",
  "refusal.ownerOnly": "Only the owner can do this",
  "refusal.shedPhoneOnly":
    "They work only on the shed phones and have no login, so there is no password to set.",
  "refusal.pinIsForStaff":
    "A PIN is for barn staff: the shed phone works as barn staff and nothing more.",
  "refusal.personalPhoneOnly":
    "This is done from your own phone, not the shed's",
  "refusal.notAwaitingApproval": "That money is not waiting for approval",
  "refusal.visitedInTheFuture":
    "A visit cannot be on a day that has not come yet",
  "refusal.boughtInTheFuture":
    "Medicine cannot be bought on a day that has not come yet",
  "refusal.drugRetired":
    "That product is retired; the vet restores it before more is bought",
  "refusal.amountChanged":
    "The amount was corrected since you read it; read it again",
  "money.from.byHand": "Entered by hand",
  "byHand.title": "Enter money",
  "byHand.category": "Category",
  "byHand.in": "in",
  "byHand.out": "out",
  "byHand.amount": "Amount ({currencySign})",
  "byHand.on": "Day",
  "byHand.counterparty": "Paid to or received from",
  "byHand.wagePerson": "Who the wage is for",
  "byHand.wageMonth": "Month the wage pays for",
  "byHand.wageMonthName": "Month",
  "byHand.wageYear": "Year",
  "byHand.pickMonth": "Choose a month",
  "byHand.note": "Note",
  "byHand.receipt": "Receipt photo",
  "byHand.save": "Enter it",
  "byHand.looksEntered": "This looks entered already",
  "byHand.looksEnteredSaid":
    "{by} already entered {amount} to {name} on {day}, under {category}.",
  "byHand.looksEnteredTold":
    "Save it again only if it really is a second one; the owner will hear of it.",
  "byHand.looksEnteredAsk": "Save it again only if it really is a second one.",
  "byHand.saveAgain": "Save it again",
  "byHand.somebody": "Somebody",
  "refusal.looksEnteredAlready":
    "This looks like money already entered: the same person, the same {currencySum}, the same day",
  "byHand.entered": "Entered",
  "byHand.retireTitle": "Retire the “{name}” category?",
  "byHand.retireWhy":
    "New money can no longer be entered under it. What is already written under it stays as it is.",
  "byHand.chargedToAnimals": "The animals carry it",
  "byHand.chargeToAnimals": "Charge it to the animals",
  "byHand.stopCharging": "Stop charging it to the animals",
  "byHand.paidMonthly": "Paid every month",
  "byHand.markMonthly": "Mark as paid every month",
  "byHand.stopMonthly": "No longer paid every month",
  "byHand.retire": "Retire",
  "byHand.newCategory": "New category",
  "byHand.direction": "In or out",
  "byHand.addCategory": "Add",
  "byHand.showReceipt": "Receipt",
  "byHand.wageFor": "wage for {month}",
  "byHand.retired": "Retired",
  "byHand.categoryName": "Name",
  "byHand.noCategories": "No categories yet",
  "byHand.categories": "Categories",
  "byHand.newCategoryHint":
    "A heading for money the farm enters by hand. One no longer used is retired, never removed.",
  "refusal.wageAlreadyEntered":
    "That person's wage for that month is already entered",
  "refusal.wageNeedsMonth": "A wage names the month it pays for",
  "refusal.monthIsForWages": "Only a wage pays for a month",
  "refusal.categoryExists": "The farm already has that category",
  "refusal.feedItemExists": "The farm already has a feed by that name",
  "refusal.categoryRetired": "That category is retired",
  "refusal.categoryKeptByRecords":
    "That category's money comes from its own record",
  "refusal.correctTheRecord":
    "That money comes from a record — a sale, an intake, a milk lorry, a vet's fee: put it right where it was written, and its money follows",
  "refusal.enteredInTheFuture":
    "Money cannot have moved on a day that has not come yet",
  "byHand.side": "Side",
  "byHand.wholeFarm": "Whole farm",
  "byHand.correct": "Correct",
  "refusal.categoryKeptForWages":
    "Wages are kept: a wage is one per person per month under them",
  "costs.title": "What she has cost",
  "costs.feed": "Feed",
  "costs.medicine": "Medicine",
  "costs.bought": "Bought for",
  "costs.sold": "Sold for",
  "costs.margin": "Margin",
  "costs.notSold": "not sold yet",
  "costs.liters": "Liters to bulk",
  "costs.perLiter": "Cost per liter",
  "costs.bySide": "Costs by side",
  "costs.unpricedNote":
    "{amount} kg of home-grown fodder was fed at no price, and costs nothing here",
  "costs.uncostedNote":
    "{amount, plural, one {# dose was of medicine the farm had not bought, and is not costed} other {# doses were of medicine the farm had not bought, and are not costed}}",
  "costs.strayHerdNote":
    "{currencySign}{amount} was spent on the animals of a side in a month when none were standing there, and is charged to nobody",
  "costs.strayTripNote":
    "{currencySign}{amount} was spent on buying trips that brought no animal home, and is charged to nobody",
  "costs.unallocatedNote":
    "{currencySign}{amount} of feed went to pens with no animals recorded in them, and is charged to nobody",
  "costs.vet": "Vet visits",
  "costs.market_toll": "Market toll",
  "costs.trips": "Buying and selling trips",
  "costs.herd": "Herd costs",
  "costs.overheads": "Running the farm",
  "costs.overheadsHint":
    "Wages, rent, electricity and the like. Not charged to any animal, season or venture.",
  "costs.overheadsTotal": "All of it",
  "costs.perHeadPerDay": "A head a day",
  "costs.headDays":
    "Worked over every animal's days on the farm, the ventures' among them: {days}.",
  "costs.costOfGain": "Cost per kg gained",
  "costs.thisLactation": "This lactation",
  "costs.soldInPeriod":
    "Fattening animals sold in this period, each over her whole life",
  "accountant.title": "For the accountant",
  "accountant.summary": "Income and expense",
  "accountant.csv": "Every money event",
  "accountant.hint": "For the period chosen above.",
  "accountant.summaryHint":
    "Income against expense by category, counterparty and side, and who owed the farm at the period's end, on the farm's letterhead to print or save as a PDF.",
  "accountant.csvHint":
    "One row to each money event, with the record behind it, its side and account, and whether it is approved, to open in a spreadsheet.",
  "exports.csv": "Download CSV",
  "costs.bySideHint":
    "What each side's animals were fed, dosed and visited for in the period chosen above, and the fattening animals sold in it.",
  "work.wholeFarm": "The whole farm",
  "work.calledOff":
    "Called off — the farm no longer owes this work, and nothing more is recorded on it",
  "work.closedAsMissed":
    "Closed as missed by the manager — nothing more is recorded on it",
  "renewal.runsOut": "The registration runs out on {date}",
  "renewal.newExpiry": "The renewed certificate runs out on",
  "renewal.certificate": "Photograph of the renewed certificate",
  "refusal.renewalNotLater":
    "A renewed registration runs out after the one it replaces",
  "refusal.renewalNeedsCertificate":
    "A renewal keeps a photograph of the renewed certificate",
  "refusal.renewalNeedsExpiry":
    "A renewal says when the renewed certificate runs out",
  "certificate.title": "Registration certificate",
  "certificate.taken": "Certificate photographed",
  "certificate.takenOn": "Photographed {date}",
  "certificate.none": "No photograph of the certificate yet",
  "certificate.take": "Photograph the certificate",
  "certificate.hint":
    "A clear photograph of the certificate, kept the moment it is taken. Take it again when the certificate is renewed.",
  "owner.registrationRenewal": "Registration renewal",
  "owner.registrationEnding": "The registration runs out on {date}: renew it",
  "owner.registrationExpired": "The registration ran out on {date}",
  "alerts.registrationRenewal":
    "The registration runs out on {date}: its renewal is on your list",
  "alerts.dayNotTurning":
    "The farm's schedule has not run cleanly since {since}: work may not be raised and notices may not go. See Backups.",
  "alerts.workMissed":
    "{count, plural, one {# piece} other {# pieces}} of work went late between {since} and now, while the farm's day was not turning. They are on the overdue list.",
  "alerts.takenBack": "{tag}: {what}",
  "alerts.proposalAnswered": "Your change to {sop} {answer}{note}",
  "alerts.openTheWorkList": "Open the work list",
  "alerts.openTheReviews": "Open what needs a look",
  "alerts.openTheOverdue": "Open the overdue list",
  "alerts.backupOverdue":
    "No copy of the farm has succeeded since {since}. See Backups.",
  "alerts.serverFailing":
    "The server has failed to answer {count, plural, one {# call} other {# calls}} since {since}. The phones keep their work in the Outbox until it answers again. See Backups.",
  "alerts.monthlyCopyFailed":
    "The monthly copy of the farm, the one kept for years, failed on {since}. See Backups.",
  "alerts.passwordGuessed":
    "{guesses} wrong passwords for {who} since {since}. The account now takes one try a minute.",
  "refusal.workInNoPen":
    "This step records a pen's work, and this work is in no pen",
  "renewal.issuedOn": "The renewed certificate was issued on",
  "nav.inspector": "Inspector view",
  "inspector.registration": "Registration",
  "inspector.herd": "Herd summary",
  "inspector.animals": "Animals on the farm",
  "inspector.byPen": "By pen",
  "inspector.onTheFarm": "On the farm",
  "refusal.registerHasNoCsv": "That register is printed, not given as a CSV",
  "refusal.registerHasNoPaper": "That register is given as a CSV, not printed",
  "inspector.vaccinations": "Vaccination register",
  "inspector.noVaccinations": "No vaccinations in this period",
  "inspector.lotNumber": "Lot number {lotNumber}",
  "inspector.vaccinatedBy": "Given by {giver}",
  "refusal.lotNumberMissing":
    "This is a vaccine: write the campaign's lot Number first, or this dose's own",
  "inspector.mortalities": "Mortality register",
  "inspector.noMortalities": "No deaths in this period",
  "inspector.movementLog": "Movement log (CSV)",
  "refusal.disposalAlreadyRecorded":
    "Her disposal is already written down; put it right with a correction",
  "inspector.subtitle":
    "Everything a DLS inspector asks to see, ready to show on this screen and hand over as paper.",
  "inspector.standing.unknown": "Expiry not recorded",
  "inspector.noNumber": "The farm's registration number is not written down",
  "inspector.noNumberHint":
    "Papers for an inspector carry it. Add it under farm identity before printing.",
  "inspector.asOfLine": "As of {date}",
  "inspector.period": "Period for the registers",
  "inspector.tab.registration": "Registration and herd",
  "inspector.tab.vaccinations": "Vaccinations",
  "inspector.tab.treatments": "Treatments",
  "inspector.tab.diseases": "Disease history",
  "inspector.tab.deaths": "Deaths",
  "inspector.tab.movements": "Movements",
  "inspector.kpi.valid": "Valid",
  "inspector.kpi.endingSoon": "Ending soon",
  "inspector.kpi.expired": "Expired",
  "inspector.kpi.unknown": "Not recorded",
  "inspector.kpi.expires": "Expires {date}",
  "inspector.kpi.onFile": "On file",
  "inspector.kpi.noPhoto": "Not yet",
  "inspector.periodHint":
    "Leave a day empty and each register reads its own usual period back.",
  "inspector.clearPeriod": "Clear the period",
  "inspector.movementHint":
    "Every Move, intake, sale and death in the period, as a spreadsheet for the inspector to take away.",
  "inspector.saveMovements": "Save the movement log as CSV",
  "inspector.treatments": "Treatment register",
  "inspector.diseases": "Disease history",
  "inspector.clear": "Milk clear {milk} · meat clear {meat}",
  "inspector.csv": "CSV",
  "inspector.givenBy": "Given by {giver} · prescribed by {vet}",
  "inspector.noTreatments": "No treatments in this period",
  "inspector.noDiseases": "No diagnoses in this period",
  "inspector.notifiable": "notifiable · DLS reference {reference}",
  "inspector.col.lotNumber": "Lot number",
  "inspector.col.prescribedBy": "Prescribed by",
  "inspector.col.milkClear": "Milk clear",
  "inspector.col.meatClear": "Meat clear",
  "inspector.col.notifiable": "Notifiable",
  "inspector.col.outcome": "Outcome",
  "inspector.col.cause": "Cause",
  "inspector.col.disposal": "Disposal",
  "inspector.col.dlsReference": "DLS reference",
  "refusal.periodBackwards": "A period ends after it begins",
  "refusal.farmIdentityIncomplete":
    "The farm's registration number is not recorded; write it in the farm details first",
  "home.until": "until {date}",
  "home.workDone": "Work done",
  "home.cowsHeld": "Milk held back",
  "home.subtitle":
    "What needs you first, then how the day is going pen by pen.",
  "home.waitingHint": "Things waiting for a decision",
  "home.queueHint":
    "Oldest and most urgent first. Each opens the work or the animal.",
  "home.allClearHint":
    "Nothing is overdue, waiting to be checked or held back. New work appears here as it falls due.",
  "home.pensWorking": "Pens with work today",
  "home.pensHint": "Tap a pen to see its work.",
  "home.endingSoon": "Ending soon",
  "home.queue": "What needs you",
  "home.overdue": "Late",
  "home.signOff": "Waiting for sign-off",
  "home.needsReview": "Needing a decision",
  "home.monthlyCosts": "Not entered yet",
  "home.wageNotEntered": "Wage: {name}",
  "home.withdrawal": "Under withdrawal",
  "home.pens": "Pen by pen",
  "home.progress": "{done} of {raised} done",
  "home.animalsIn": "{count, plural, one {# animal} other {# animals}}",
  "home.allClear": "Nothing needs you right now",
  "home.nothingRaised": "The day's work has not been raised yet",
  "nav.theDay": "Farm today",
  "owner.approvals": "Waiting on you",
  "owner.escalated": "Escalated to you",
  "owner.discardToday": "Discarded today",
  "owner.average":
    "{liters, plural, one {# liter} other {# liters}} on an average day",
  "owner.noNote": "No reason given",
  "owner.subtitle":
    "What only you can decide, then how the farm is doing today.",
  "owner.waitingCount": "{count} waiting for you",
  "owner.allFineHint":
    "No approvals, proposals or late work are waiting. Anything new that needs you appears here.",
  "owner.needsYou": "Needs you",
  "owner.allFine": "All fine",
  "owner.proposals": "Playbook proposals",
  "owner.endingWithdrawal": "Withdrawal ending",
  "owner.bulkToday": "To the tank today",
  "owner.liters": "{liters, plural, one {# liter} other {# liters}}",
  "owner.noRecord": "nothing recorded",
  "owner.weekTitle": "Milk to the tank, last 7 days",
  "owner.milkHint": "Yesterday {yesterday} L · average {average} L",
  "owner.monthNet": "Net this month",
  "owner.inAndOut": "In {in} · out {out}",
  "owner.herd": "Animals on the farm",
  "owner.bySide": "Dairy {dairy} · fattening {fattening}",
  "owner.entries": "{count, plural, one {# entry} other {# entries}}",
  "owner.moneyTotal": "Total {amount}",
  "owner.onTheFarm": "On the farm today",
  "owner.onTheFarmHint": "The manager is on these; they are here so you know.",
  "owner.nothingLate": "Nothing late and nothing running low",
  "owner.moneyMonth": "This month's money",
  "owner.topSpending": "Where the money went",
  "owner.open": "Open",
  "owner.fatteningTitle": "Fattening and sale",
  "owner.maySell": "{count} may be sold",
  "owner.noneToSell": "None ready to sell yet",
  "owner.costsMoreToKeep": "{count} cost more to keep than they put on",
  "owner.feedLow": "{feed}: {onHand} {unit} left",
  "owner.allStocked": "No feed running low",
  "owner.noLosses": "No animals lost in the last 30 days",
  "owner.mightCull":
    "{count, plural, one {# cow} other {# cows}} might be culled",
  "owner.losses": "Lost in 30 days: {died} died · {culled} culled",
  "owner.lossesBornDead":
    "Lost in 30 days: {died} died · {culled} culled · born dead: {bornDead}",
  "owner.todayMark": "Today",
  "mortality.happenedAt": "When she went",
  "mortality.correct": "Correct it",
  "mortality.why": "Why the change",
  "mortality.saveCorrection": "Save the correction",
  "mortality.corrected": "Corrected",
  "event.death": "An animal dies",
  "event.heat": "A cow is seen in heat",
  "mortality.record": "Record a death or a cull",
  "mortality.kind": "How she went",
  "mortality.died": "Died",
  "mortality.culled": "Culled",
  "mortality.diagnosis": "What the vet found",
  "mortality.diagnosisHint":
    "Where she died of what the vet diagnosed, link it: the register then names the disease and the office's reference.",
  "mortality.noDiagnosis": "None of these",
  "early.title": "Lost soon after buying",
  "early.hint":
    "The last year: animals that died, were culled, fell ill or weighed under what they were bought at within 30 days of arriving, by who sold them and where.",
  "early.bySeller": "By seller",
  "early.byLivestockMarket": "By livestock market",
  "early.line":
    "bought {bought} · died {died} · culled {culled} · ill {diagnosed} · weighed short {weighedShort}",
  "early.none":
    "Nothing bought in the last year died, was culled or fell ill in its first 30 days.",
  "deaths.title": "Deaths among grown animals",
  "deaths.hint":
    "The last year, past weaning: deaths for every hundred head kept a year, culls counted apart.",
  "deaths.dairy": "Dairy",
  "deaths.fattening": "Fattening",
  "deaths.rate": "{rate} a hundred a year",
  "deaths.counts": "Died {died}, culled {culled}",
  "deaths.noneKept": "None kept",
  "deaths.causes": "What they died of: {causes}",
  "herd.healthTitle": "The dairy herd's year, and sickness",
  "herd.healthHint":
    "Every way a cow left the milking herd — died, culled, sold, crossed to fattening — and the heifers that joined it, over the cows kept; and diagnoses over the head kept.",
  "herd.leftTheHerd": "Cows that left the milking herd",
  "herd.leftCounts":
    "Died {died}, culled {culled}, sold {sold}, to fattening {crossed}, lost {lost}",
  "herd.joinedTheHerd": "Heifers that joined it",
  "herd.joinedCount":
    "{count, plural, one {# heifer calved} other {# heifers calved}} her first",
  "herd.sickDairy": "Sick in the dairy",
  "herd.mastitis": "Mastitis, over the cows",
  "herd.diseases": "What was found: {diseases}",
  "mortality.cause": "Cause, as far as the farm knows",
  "mortality.disposal": "What was done with the carcass",
  "mortality.stillbirth": "Stillbirth",
  "mortality.awaitingDisposal": "Awaiting",
  "mortality.recordDisposal": "Write the disposal",
  "mortality.buried": "Buried (six feet)",
  "mortality.burned": "Burned",
  "mortality.disposalNote": "Where, and how",
  "mortality.photo": "Photograph",
  "mortality.photoHint":
    "The dead animal, her ear tag showing — a newborn with no tag yet, beside her dam's",
  "mortality.photoTake": "Take a photo",
  "mortality.noPhoto": "No photograph — written before one was asked for",
  "mortality.photoAlt": "{tag}'s death photograph",
  "mortality.photoReplaced": "replaced by a newer one",
  "voided.photos": "Photos from records voided",
  "voided.photosHint":
    "Kept when a record of hers was voided. A death's photo shows the tag of the animal that really died.",
  "voided.fromDeath": "From a voided death",
  "voided.fromSale": "From a voided sale's receipt",
  "voided.deathPhotoAlt": "The photo taken for a death written against {tag}",
  "voided.receiptAlt": "The receipt of a sale written against {tag}",
  "mortality.recorded": "Recorded",
  "alerts.notifiableDiagnosis":
    "{tag} — {disease}: must be reported to DLS without delay",
  "notifiable.add": "Add a disease",
  "notifiable.name": "Disease name",
  "notifiable.nameEn": "English name (if any)",
  "notifiable.otherNames": "Other names",
  "notifiable.otherNamesAre": "Also written: {names}",
  "notifiable.otherNamesHint":
    "Separated by commas: the letters and other spellings a vet may write it by, such as FMD or খুরা রোগ. A diagnosis in any of them raises the report.",
  "notifiable.otherNamesSave": "Save the names",
  "notifiable.otherNamesSaved": "Other names saved",
  "notifiable.note": "What the ULO said",
  "notifiable.retire": "Take off the list",
  "notifiable.retired": "Off the list",
  "notifiable.none": "The list is empty",
  "notifiable.addedBy": "added by {name}",
  "notifiable.why": "Why it is coming off",
  "notifiable.col.addedBy": "Added by",
  "notifiable.subtitle":
    "Diseases the Upazila Livestock Officer has confirmed must be reported to DLS without delay.",
  "notifiable.onList": "On the list",
  "notifiable.col.status": "Status",
  "notifiable.rowActions": "{name} — more actions",
  "notifiable.added": "Disease added to the list",
  "notifiable.addHint":
    "As the ULO confirmed it. The English name too, if there is one, so a diagnosis written either way is matched.",
  "notifiable.takenOff": "Taken off the list",
  "notifiable.takeOffHint":
    "It stays here marked as taken off; your reason is kept in the audit log.",
  "notifiable.letter": "See the letter",
  "notifiable.letterTitle": "Letter to DLS",
  "nav.notifiable": "Notifiable diseases",
  "sop.trigger.notifiable": "A notifiable disease is found",
  "sop.effect.dls_report": "Records the letter delivered",
  "email.confirmCode.subject": "The code to confirm your email",
  "email.confirmCode.body":
    "The code to confirm your email in the {farm} Investor Portal: {code}\n\nEnter it on the portal's “Account” page. It works for {minutes, plural, one {# minute} other {# minutes}}. If you did not ask for it, ignore this email and tell the farm.",
  "signing.paper.agreement_offer": "investment agreement",
  "signing.paper.amendment_offer": "amendment",
  "signing.paper.nomination_offer": "মনোনয়নপত্র",
  "signing.paperIn.agreement_offer": "investment agreement",
  "signing.paperIn.amendment_offer": "amendment",
  "signing.paperIn.nomination_offer": "মনোনয়নপত্র",
  "signing.code.sms":
    "{farm}: your code to agree to the {paperIn} is {code}. It works for {minutes, plural, one {# minute} other {# minutes}}. Tell nobody.",
  "signing.code.subject": "Your code to agree to a paper",
  "signing.code.email":
    "The code to agree to the {paperIn} in the {farm} Investor Portal: {code}\n\nEntering it on the paper's page is your agreement, as your signature would be. It works for {minutes, plural, one {# minute} other {# minutes}}. Tell nobody; if you did not ask for it, tell the farm.",
  "signing.approved.sms":
    "{farm}: your {paper} no. {number} for {venture} is approved by the farm.",
  "signing.approvedNomination.sms":
    "{farm}: your {paper} no. {number} is approved by the farm.",
  "signing.approvedNomination.email":
    "{farm} has approved your {paper} no. {number}, which you agreed to in the portal with a code. It is your list of nominees from now on.",
  "signing.approved.subject": "Your paper is approved",
  "signing.approved.email":
    "{farm} has approved your {paper} no. {number} for {venture}, which you agreed to in the portal with a code. Its copy is on the portal's “Papers” page.",
  "sms.myNumber": "Your mobile number",
  "sms.title": "Text messages",
  "sms.why":
    "Only two notices go by text — a withdrawal ending, and a disease that must be reported",
  "sms.save": "Save the number",
  "sms.saved": "Number saved",
  "sms.withdrawalEnding":
    "{tag} — her milk withdrawal is ending. See the farm app.",
  "sms.notifiableDiagnosis":
    "{tag} — {disease}. Must be reported to DLS without delay. See the farm app.",
  "alerts.entryRejected":
    "{count, plural, one {# entry} other {# entries}} the farm could not take — {reason}",
  "alerts.withdrawalChanged": "{tag} — her withdrawal has changed",
  "alerts.moneyAwaiting":
    "{currencySign}{amount} for {category} is awaiting your approval",
  "alerts.lowStock": "{feed} is running low — {onHand} {unit} left",
  "alerts.receivableOverdue":
    "Receivable overdue since {since}: {currencySign}{amount} from {buyer}",
  "alerts.creditAfterWriteOff":
    "{buyer} took {currencySign}{lent} on credit again; {currencySign}{written} of his was written off, last on {day}",
  "alerts.monthlySumMissed":
    "{investor} has missed {currencySign}{amount} of monthly sums on {venture}, the latest due {day}",
  "alerts.seeWhoIsBehind": "See who is behind",
  "ventureTrouble.payInNotes":
    "{count, plural, one {# pay-in note} other {# pay-in notes}} to check against the bank",
  "alerts.payInNoteSent":
    "{investor} says they sent {currencySign}{amount} {way} on {day}, for {venture}",
  "alerts.checkThePayInNotes": "Check it against the bank",
  "alerts.seeWhoOwes": "See who owes what",
  "alerts.lotExpiring":
    "{item}, lot {lot}: expires on {date}, with {left} left",
  "alerts.lotExpired":
    "{item}, lot {lot}: expired on {date}, and {left} is still in the store",
  "alerts.medicineLowStock":
    "{item} is running low: {onHand, plural, one {# dose} other {# doses}} left",
  "alerts.expiredDoseGiven":
    "{tag} was given {item} from lot {lot}, which expired on {date}",
  "params.expiryWarn": "Warn of a lot expiring, this many days before",
  "drugs.doseWord": "doses",
  "alerts.investorStatementDue":
    "{venture}: {investors, plural, one {# investor is} other {# investors are}} due their progress statement ({occasion})",
  "alerts.reimbursementDue":
    "{venture}: {month}'s reimbursement is due — {currencySign}{amount}",
  "alerts.reimburseNow": "Reimburse",
  "alerts.joinRequested":
    "Request to join {venture} from {investor}: {units, plural, one {# unit} other {# units}}",
  "alerts.readTheRequests": "Read the requests",
  /** The one notice that leads somewhere: the screen where the paper it is about is made. */
  "alerts.makeThePaper": "Make the papers",
  "alerts.openTheWork": "Open the work",
  "alerts.openTheCard": "Open its card",
  "alerts.openHer": "See {tag}",
  "nav.farm": "Farm overview",
  "drugs.add": "Add a product",
  "drugs.name": "Product name",
  "drugs.milkDays": "Milk withdrawal days",
  "drugs.meatDays": "Meat withdrawal days",
  "drugs.blank": "Waiting for the vet",
  "drugs.save": "Write the days",
  "drugs.setBy": "written by {name}, {date}",
  "drugs.restore": "Restore",
  "drugs.rename": "Rename",
  "drugs.renameTitle": "Rename {name}",
  "drugs.renameHint":
    "Every prescription, dose and paper that names this product will say the new name. The old one stays in the audit trail.",
  "drugs.addStandard": "Add the standard medicines",
  "drugs.addStandardTitle":
    "Add {count, plural, one {# standard medicine} other {# standard medicines}}?",
  "drugs.addStandardHint":
    "These are added: {names}. None of them can be prescribed until the vet writes their withdrawal days.",
  "drugs.addedStandard":
    "{count, plural, one {# medicine} other {# medicines}} added",
  "drugs.managerAdds": "The vet will write the days",
  "drugs.retireTitle": "Retire {name}?",
  "drugs.retireWhy":
    "A retired product can no longer be prescribed or bought. Past treatments keep its name, and it can be restored.",
  "drugs.retire": "Retire",
  "drugs.retired": "Retired",
  "drugs.none": "Nothing on the list yet",
  "drugs.vetOnly": "Only the vet writes the days",
  "drugs.days": "{count, plural, one {# day} other {# days}}",
  "drugs.vaccine": "Vaccine",
  "drugs.markVaccine": "It is a vaccine",
  "drugs.unmarkVaccine": "Not a vaccine",
  "drugs.col.setBy": "Written by",
  "drugs.subtitle":
    "What the farm treats animals with, and how many days milk and meat are held after each.",
  "drugs.tab.products": "Products",
  "drugs.col.status": "Status",
  "drugs.col.perDose": "Per dose",
  "drugs.status.prescribable": "Can be prescribed",
  "drugs.kpi.onList": "On the list",
  "drugs.kpi.onListHint": "Not retired",
  "drugs.kpi.prescribable": "Can be prescribed",
  "drugs.kpi.prescribableHint": "Both days written",
  "drugs.kpi.waitingHint": "Nothing may be prescribed from these yet",
  "drugs.kpi.vaccines": "Vaccines",
  "drugs.kpi.vaccinesHint": "Marked as a vaccine",
  "drugs.rowActions": "{name} — more actions",
  "drugs.daysHint":
    "Whole days from the label, from none up to 365. Nothing may be prescribed until both are written.",
  "drugs.daysSaved": "Days written",
  "drugs.added": "Product added",
  "drugs.addHint":
    "The name as it is on the label. The vet writes its days after.",
  "drugs.buyHint":
    "As the box and the slip say it. The money for the medicine is recorded from this.",
  "drugs.perDose": "{currencySign}{amount} per dose",
  "drugs.noneBought": "Nothing bought for this product yet",
  "drugs.boughtSummary":
    "{count, plural, one {# purchase} other {# purchases}} · {currencySign}{amount} · {doses, plural, one {# dose} other {# doses}}",
  "vet.waiting": "Waiting for an answer",
  "vet.nothingWaiting": "Everything the rounds saw has been answered",
  "vet.mine": "What you concluded",
  "vet.onItsOwn": "Record without an observation",
  "vet.diagnoseHer": "Record a diagnosis",
  "vet.tagNumber": "Animal tag",
  "vet.noAnimalToDiagnose":
    "No animal on the farm is yours to diagnose just now",
  "vet.noneMine": "You have not recorded anything yet",
  "vet.disease": "Disease",
  "vet.diseaseHint":
    "Choose from the list, or write another disease in your own words.",
  "vet.notifiableNamed":
    "{disease} must be reported to DLS: saving this raises the letter to the office at once.",
  "vet.outcome": "How it ended",
  "vet.note": "What you found",
  "vet.record": "Record the diagnosis",
  "vet.recorded": "Diagnosis recorded",
  "vet.answering": "answering {saw}",
  "vet.correct": "Correct",
  "vet.voidWhy": "Written against the wrong animal",
  "vet.voidDiagnosis":
    "Take it away: she has no such disease, and a report not yet taken goes with it",
  "vet.subtitle":
    "What the rounds have seen and nobody has answered, what you concluded, and the courses you ordered.",
  "vet.tab.repeat": "Will not settle",
  "vet.kpi.waitingHint": "Seen on the rounds, not answered",
  "vet.kpi.mine": "Concluded lately",
  "vet.kpi.mineHint": "Your diagnoses of the last two weeks",
  "vet.kpi.owed": "Doses still to give",
  "vet.kpi.owedHint": "From the courses you ordered",
  "vet.kpi.casesHint": "Animals you were called in for",
  "vet.kpi.repeatHint": "Waiting for a decision",
  "vet.answerHint":
    "Your answer to what the round saw. It is your own act, recorded in your name.",
  "vet.onItsOwnHint":
    "You came for one animal and found something on another: name her by her tag.",
  "vet.noRepeatBreeders": "No cow is waiting for a decision",
  "prescribe.noTreatmentSop":
    "The farm has no published treatment procedure yet — the owner publishes one",
  "prescribe.product": "Product",
  "prescribe.dose": "Dose",
  "prescribe.route": "How it goes in",
  "prescribe.times": "At what times",
  "prescribe.days": "For how many days",
  "prescribe.write": "Write the prescription",
  "prescribe.written":
    "{doses, plural, one {# dose} other {# doses}} raised as work",
  "prescribe.progress": "{given} of {of} given",
  "prescribe.given": "given by {name}",
  "prescribe.owed": "not given yet",
  "prescribe.missed": "not given",
  "prescribe.skipped": "skipped: {reason}",
  "prescribe.stopped": "stopped",
  "prescribe.stop": "Stop the course",
  "prescribe.stopReason": "Why it is stopped",
  "prescribe.stoppedDone":
    "Course stopped; the doses still to give are owed no more",
  "prescribe.calledOff": "called off",
  "prescribe.course": "Course of treatment",
  "prescribe.sheetHint":
    "Each dose becomes a piece of work for somebody in the shed, at the times you give.",
  "prescribe.timesHint": "Separate times with commas, like 08:00, 20:00",
  "prescribe.dosesPreview":
    "{doses, plural, one {# dose} other {# doses}} will be raised as work",
  "route.intramuscular": "Intramuscular",
  "route.intravenous": "Intravenous",
  "route.subcutaneous": "Subcutaneous",
  "route.oral": "Oral",
  "route.intramammary": "Intramammary",
  "route.topical": "Topical",
  "nav.vet": "Vet",
  "animals.diagnosis": "The vet's conclusion",
  "animals.healthChain": "Health",
  "animals.diagnosedBy": "{name}, {date}",
  "nav.drugs": "Medicines",
  "nav.today": "Today's work",
  "work.subtitle": "Everything due now in the pens you work. Tap one to start.",
  "work.count": "{count} due",
  "work.lateCount": "{count} late",
  "work.noneHint":
    "When the next job falls due it appears here. Nothing is waiting on you.",
  "work.animalsDone": "Animals done",
  "work.stepDone": "Done",
  "work.correcting": "Correcting an entry",
  "work.blockedWithdrawal": "Blocked: milk withdrawal",
  "work.claimHint":
    "Take this job so the farm knows it is yours. Nobody else can record it while you have it.",
  "work.tallyDone": "{count} done",
  "work.tallySkipped": "{count} skipped",
  "work.tallyLeft": "{count} left",
  "work.tileDone": "Done",
  "work.tileSkipped": "Skipped",
  "work.tileLeft": "To do",
  "work.nextAnimal": "Next animal: {tag}",
  "work.tileNext": "Next",
  "work.animalsTitle": "Animals in this pen",
  "alerts.showAll": "Show all {count}",
  "alerts.showFewer": "Show fewer",
  "work.open": "Open",
  "work.stateSentBack": "Sent back",
  "work.penFilter": "Which pen's work",
  "work.allPens": "All pens",
  "work.title": "Today's work",
  "work.raise": "Raise work now",
  "work.raiseTitle": "Raise a piece of the Playbook",
  "work.raiseHint":
    "For work the clock does not raise — a weigh-in, a vaccination campaign, the calving pen, a stock count. It goes on today's list for that pen.",
  "work.raiseSop": "What to do",
  "work.raisePen": "For which pen",
  "work.raiseSubmit": "Raise it",
  "work.raised": "Raised — it is on today's list",
  "work.raisedAlready": "Already raised for that pen today",
  "people.pens": "Pens they work",
  "people.pensSave": "Save pens",
  "people.pensSaved": "Pens saved",
  "people.pensNone": "No pens yet — they will see no work until they have some",
  "work.none": "Nothing due right now",
  "work.due": "Due {time}",
  "work.claim": "Start",
  "work.theirsToStart": "Pinned to {name} — theirs to start",
  "work.heldBy": "{name} is doing this — you can read it here, not record it",
  "work.claimed": "You are working on this",
  "work.takenBy": "Someone else is working on this",
  "work.pinnedToSomeone": "Pinned to someone else",
  "work.assignTo": "Who does this",
  "work.anyoneInRole": "Anyone who is {role}",
  "work.assigned": "Updated who does this work",
  "work.progress": "{done} of {total}",
  "work.skip": "Skip",
  "work.skipWhy": "Why skip?",
  "work.noRation":
    "This phone does not have this pen's ration — open it once with signal",
  "work.given": "Given (kg)",
  "work.leftover": "Left from the last feed (kg)",
  "work.shortFed": "{percent}% under the ration",
  "work.back": "Back",
  "work.confirm": "Done",
  "work.outOfRange": "That is outside the usual range. Keep it?",
  "work.keepAnyway": "Yes, keep it",
  "work.lastTime": "Last time {figure} {unit}",
  "work.tapWhenDone": "Tap when done",
  "work.farFromLast": "Last time it was {figure} {unit}. Is this right?",
  "work.finish": "Finish",
  "work.finished": "Finished — waiting for sign-off",
  "work.finishedNoCheck": "Finished",
  "work.notFinished": "Still to do",
  "work.photo": "Photo",
  "work.when": "When",
  "work.note": "Note",
  "work.saved": "Saved",
  "milk.destination": "Where did it go?",
  "milk.bulk": "Bulk tank",
  "milk.calves": "Calves",
  "milk.discard": "Poured away",
  "milk.withdrawal": "Under withdrawal — this milk cannot go to the tank",
  "milk.withdrawalShort": "Withdrawal",
  "milk.forced":
    "Under withdrawal — recorded as poured away, not sent to the tank",
  "milk.difference": "The tank is {liters} L away from the cows",
  "milk.matched": "The tank matches the cows",
  "mismatch.hint":
    "Milkings where the bulk tank and the cows' figures are further apart than the farm allows. Correct the figure on the work and it leaves this list.",
  "mismatch.none": "Every tank reading matches its cows",
  "mismatch.tank": "Bulk tank reading",
  "mismatch.cows": "The cows, added up",
  "mismatch.col.difference": "Difference",
  "mismatch.eachCow": "Each cow",
  "mismatch.openWork": "Open the work",
  "milk.flagged": "The manager will look at this",
  "alerts.title": "Alerts",
  "alerts.withdrawalEnding": "{tag} — her milk withdrawal is ending",
  "animals.milkHeldUntil": "Milk held until {date}",
  "animals.meatHeldUntil": "Fit for sale from {date}",
  "animals.withdrawalWas": "The doses alone said {date}",
  "animals.withdrawalShortened": "Shortened by the vet: {reason}",
  "withdrawal.shorten": "Shorten the withdrawal",
  "withdrawal.milkUntil": "Milk held until",
  "withdrawal.meatUntil": "Meat held until",
  "withdrawal.reason": "Why it is being shortened",
  "withdrawal.shortened": "Withdrawal shortened",
  "withdrawal.endNow": "Empty the box to end it now",
  "home.meatWithdrawal": "Held back from sale",
  "home.lowStock": "Feed running low",
  "home.lowStockLine": "{feed}: {onHand} {unit} left, below {threshold}",
  "home.openList": "Open the full list",
  "alerts.dismiss": "Got it",
  "alerts.instanceOverdue": "{sop} in {pen} is late",
  "alerts.instanceEscalated":
    "{sop} in {pen} has been late for {hours, plural, one {# hour} other {# hours}}",
  "alerts.instanceSentBack": "{sop} in {pen} was sent back: {reason}",
  "work.overdue": "Late",
  "work.putOff": "Again — put off before",
  "work.aboutTag": "Tag {tag}",
  "work.restWell": "The other {count} are well",
  "work.restWellTitle": "Write the other {count} down as well?",
  "work.restWellBody":
    "Each animal not yet looked at is written down as “{reason}”. Walk the whole pen first.",
  "work.restWellConfirm": "Yes, all well",
  "work.doseOf": "Dose {number} of {of}",
  "work.putOffSince": "Again — first put off {day}",
  "work.releaseOwesDoses":
    "Still owed: {doses} — he cannot be let out until it is given, or the vet writes why it is not needed",
  "work.overdueTitle": "Late work",
  "work.overdueNone": "Nothing is late",
  "work.lateFor": "Late by {hours, plural, one {# hour} other {# hours}}",
  "work.counted": "Counted",
  "work.countReason": "Why it differs",
  "signOff.none": "Nothing to check",
  "signOff.approve": "Approve",
  "signOff.yoursToBeChecked": "Yours — somebody else checks it",
  "signOff.sendBack": "Send back",
  "signOff.reason": "What needs doing again?",
  "signOff.missed": "Close as missed",
  "signOff.missedWhy": "Why was it not done?",
  "signOff.subtitle":
    "Work waiting for your check, entries that need a decision, and work that has gone late.",
  "signOff.col.work": "Work",
  "signOff.col.where": "Where",
  "signOff.col.due": "Was due",
  "signOff.col.late": "How late",
  "signOff.sendBackHint":
    "It goes back to whoever did it, with what you write here.",
  "signOff.missedHint":
    "The work is closed without being done; your reason stays with it in the record.",
  "signOff.approved": "Approved",
  "signOff.selected": "{count} selected",
  "signOff.approveSelected": "Approve {count}",
  "signOff.approveClean":
    "Approve {count, plural, one {the # clean one} other {the # clean ones}}",
  "signOff.approveCleanHint":
    "Clean: done on time, nothing flagged, nothing skipped but animals passed as well.",
  "signOff.line.passedWell": "{count} well",
  "signOff.line.tankOver":
    "tank {liters} L, {difference} L over what the cows gave",
  "signOff.line.tankUnder":
    "tank {liters} L, {difference} L under what the cows gave",
  "signOff.line.tankEven": "tank {liters} L, as the cows gave",
  "signOff.line.shortFed": "{percent}% short-fed",
  "signOff.line.outOfRange":
    "{count, plural, one {# figure} other {# figures}} out of range",
  "signOff.line.flagged": "Flagged",
  "common.clearSelection": "Clear",
  "signOff.approvedMany":
    "{count, plural, one {# approved} other {# approved}}",
  "signOff.select": "Select {work}",
  "signOff.sentBack": "Sent back",
  "signOff.closedMissed": "Closed as missed",
  "correct.why": "Why is it being changed?",
  "correct.whyMissing": "Say why it is being changed.",
  "correct.nothingChanged": "Nothing has been changed that can be saved yet.",
  "correct.save": "Save correction",
  "correct.open": "Correct",
  "correct.saved": "Corrected — the original stays in the trail",
  "correct.hint":
    "Change what is wrong. The original stays readable in the audit trail beside this correction.",
  "correct.sale": "Correct this sale",
  "correct.dispatch": "Correct this dispatch",
  "correct.purchase": "Correct this purchase",
  "correct.soldAt": "When she left",
  "correct.registration": "Void this registration",
  "correct.whatSheIs": "Put what she is right",
  "correct.whatSheIsHint":
    "Her sex, breed, birth date or dam, as she really is. Her sex stays as it is once her breeding or a calf of hers rests on it.",
  "correct.damTag": "Her dam's tag (empty if not known)",
  "correct.void": "Written against the wrong animal",
  "correct.voidSale": "Void this sale: she comes back as she was",
  "correct.voidPaymentWhy":
    "Written twice, against the wrong buyer, or for the wrong kind",
  "correct.voidPayment":
    "Void this payment: what he owes is read again without it",
  "correct.voidDeath": "Void this death: she comes back as she was",
  "correct.keep": "Keep it",
  "correct.arrival": "Correct this arrival",
  "correct.intake": "Correct what she cost",
  "correct.receivablePayment": "Correct this payment",
  "correct.writeOff": "Correct this write-off",
  "correct.abortion": "Correct this abortion",
  "correct.buyingTrip": "Correct this outing",
  "correct.sellingTrip": "Correct this selling day",
  "correct.calving": "Correct the expected calving",
  "correct.side": "Move to the other side",
  "correct.sideHint":
    "A bull calf to fattening, or an animal wrongly put on a side. She keeps her tag number.",
  "correct.toSide": "To which side",
  "correct.toPen": "Into which pen",
  "correct.buyer": "Buyer's name",
  "animals.manageHint":
    "Her photo, where she stands, her State and her tag — each change in the audit trail.",
  "pregnancy.expectedOn": "Expected to calve on",
  /** Whose animal she is, put right inside the Correction Window — a slip at the livestock market, where she was
   *  written to the wrong purse. The Farm owning her is an answer, not the absence of one. */
  "correct.whoseSheIs": "Whose she is",
  "correct.theFarmsOwn": "The farm's own",
  "correct.windowForTheFarm":
    "She was on {venture}'s target window; as the farm's own, say when the farm sells her.",
  "correct.seller": "Seller's name",
  "correct.windowOwn":
    "A {role} may put their own entry right for {span} after making it",
  "correct.windowAny":
    "A {role} may put an entry right for {span} after it was made",
  "correct.spanHours": "{hours, plural, one {# hour} other {# hours}}",
  "correct.spanDays": "{days, plural, one {# day} other {# days}}",
  "correct.notTheirs": "That is not yours to correct",
  "refusal.changedSince":
    "Someone corrected this since you opened it. Open it again to see what it says now.",
  "refusal.nothingToCorrect":
    "Nothing was changed, so there is nothing to correct",
  "review.title": "Needs a look",
  "review.none": "Nothing waiting",
  "review.resolve": "Close this",
  "review.weightIsRight": "The weight on the scale is right",
  "review.resolution": "What did you decide?",
  "review.resolveHint":
    "Write what you decided; it is kept with the record, and nothing is removed.",
  "review.resolved": "Closed",
  "review.col.what": "What happened",
  "review.col.raised": "Raised",
  "review.col.why": "Reason given",
  "review.corrected_after_sign_off":
    "An entry was corrected after it was signed off",
  "review.irreversible_effect":
    "A correction changed something that cannot be undone",
  "alerts.needsReview": "{what}: needs a look",
  "alerts.needsReviewWork": "{sop} in {pen}",
  "review.late_entry":
    "An entry arrived after the world it described had changed",
  "review.sync_gap": "A phone's entries are missing between two that arrived",
  "review.clock_skew": "A phone's clock is far out from the farm's",
  "review.held.step_completion": "A step",
  "review.held.completion_photo": "A step's photo",
  "review.held.instance_claim": "Taking the work",
  "review.held.instance_complete": "Finishing the work",
  "review.held.animal_move": "A move",
  "review.held.observation": "A sighting",
  "review.held.step_correction": "A step put right",
  "review.heldBy": "by {name}",
  "review.takeIn": "Take it in",
  "review.takeInHint":
    "It is written as it was entered, under the person who did it and at the time they did it. Say why you are sure it was done.",
  "review.takeInLabel": "How do you know it was done?",
  "review.takenIn": "Taken into the records",
  "review.oldestOf":
    "The oldest {shown} of {waiting} waiting. Close these, and the next come up.",
  "outbox.allSent": "All sent",
  "outbox.herdFresh": "Herd refreshed {ago}",
  "nav.group.today": "Today",
  "nav.group.herd": "Herd",
  "nav.group.health": "Health",
  "nav.group.milkFeed": "Milk and feed",
  "nav.group.money": "Money and investment",
  "nav.group.compliance": "Compliance",
  "nav.group.admin": "Administration",
  "nav.overview": "Overview",
  "nav.more": "More",
  "nav.menu": "Menu",
  "theme.label": "Appearance",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "Match this device",
  "shell.farm": "Farm",
  "shell.skip": "Skip to content",
  "outbox.pending": "{count} waiting to send",
  "outbox.pendingSince": "{count} waiting since {at}",
  "outbox.waitsForYou":
    "{count} still waiting to send. They go when you sign in on this device again",
  "outbox.synced": "Last sent {ago}",
  "outbox.never": "Not sent yet",
  "outbox.signedOut": "Sign in again to send what is waiting",
  "outbox.rejected": "{count} the farm sent back",
  "outbox.retry": "Try again",
  "outbox.signIn": "Sign in",
  "outbox.heldTitle": "Sent back",
  "outbox.heldNone": "Nothing sent back",
  "outbox.heldHint":
    "What the farm could not take from this phone. Check what was entered, put it in again if it still needs doing, then tap Done with this.",
  "outbox.reviewedTitle": "Waiting for someone to look",
  "outbox.reviewedNone": "Nothing waiting",
  "outbox.reviewedHint":
    "The farm took these, and someone will look at them. Tap Done with this once you know about it.",
  "outbox.discard": "Done with this",
  "outbox.entered": "What was entered",
  "outbox.ticked": "Ticked",
  "outbox.notTicked": "Not ticked",
  "outbox.late":
    "The farm had moved on before this arrived, so the manager will look at it",
  "outbox.wrong": "The farm could not take this as it was written",
  "outbox.notYours": "This was not yours to record",
  "settings.subtitle":
    "What you set for yourself: whether this device tells you things, and the number the farm may text.",
  "backups.subtitle":
    "Whether the farm's records are being copied off this machine, and whether its own clock is running.",
  "schedule.lastRan": "The farm's schedule last ran at {when}",
  "schedule.notYet": "The farm's schedule has not run since the server started",
  "schedule.failing":
    "The server failed to answer {count, plural, one {# call} other {# calls}} in the last hour",
  "schedule.failingWhat":
    "The phones keep what they record until it answers again. The reason is in the server's log: journalctl -u openfarm.",
  "schedule.what":
    "Every five minutes the server raises the day's work, tells people about late work and ending withdrawals, and carries the digest.",
  "backups.never": "No copy has ever worked",
  "backups.stale":
    "No copy for {nights, plural, one {# night} other {# nights}}",
  "backups.ok": "Worked",
  "backups.failed": "Failed",
  "backups.running": "Being taken",
  "backups.kind.nightly": "Nightly",
  "backups.kind.monthly": "Monthly",
  "backups.kind.manual": "By hand",
  "backups.why.dump": "The database could not be copied or encrypted",
  "backups.why.upload": "The copy could not be sent off the machine",
  "backups.why.tooSmall": "The copy came out too small to be the farm",
  "backups.why.notPruned": "Taken, but old copies were not deleted",
  "backups.none": "Nothing recorded yet",
  "backups.col.kind": "Kind",
  "backups.col.result": "Result",
  "backups.kpi.lastGood": "Last good copy",
  "backups.kpi.never": "Never",
  "backups.kpi.schedule": "The farm's schedule",
  "backups.kpi.running": "Running",
  "backups.kpi.stopped": "Needs a look",
  "backups.kpi.failed": "Failed copies",
  "backups.kpi.failedHint":
    "{count, plural, one {Of the last try} other {Of the last # tries}}",
  "backups.history": "Every copy tried",
  "backups.historyWhy": "Newest first, failures included.",
  "common.print": "Print",
  "common.notFound": "Not found",
  "sop.effect.weigh_in": "Weigh-in",
  "weighIn.title": "Weigh-ins",
  "weighIn.flagged": "Queried",
  "review.implausible_weight": "A weight that changed more than it could",
  "weighIn.by": "Weighed by {name}",
  "weighIn.col.weight": "Weight",
  "weighIn.col.by": "Weighed by",
  "weighIn.record": "Add a weigh-in",
  "weighIn.recordHint":
    "A reading from the farm's paper, with the day it was taken: for an animal weighed before she was in the app. The scale round still records its own.",
  "weighIn.weighedAt": "When she was weighed",
  "weighIn.weightKg": "Weight (kg)",
  "weighIn.recorded": "Weigh-in added",
  "weighIn.recordedFlagged":
    "Weigh-in added and queried: it changed more than she could have",
  "refusal.weighedInTheFuture":
    "An animal cannot have been weighed on a day that has not come yet",
  "refusal.weighedBeforeArrival":
    "An animal cannot have been weighed here before she arrived",
  "refusal.managerOnly": "This is the manager's to record",
  "refusal.noSuchBull": "There is no bull with that tag on this farm",
  "refusal.serviceNeedsTechnician": "Write who served her for an AI service",
  "refusal.serviceOfAMale": "Only a cow is served",
  "service.title": "Services",
  "service.ai": "AI",
  "service.natural": "Natural",
  "service.sire": "Sire",
  "service.servedBy": "Served by {name}",
  "service.afterHeat": "After the heat of {when}",
  "service.col.method": "Method",
  "service.col.servedBy": "Served by",
  "sop.effect.service": "Service",
  "sop.effect.pregnancy_check": "Pregnancy check",
  "sop.effect.dry_off": "Dries the cow off",
  "sop.effect.release":
    "Lets the animal out of quarantine, to the pen that suits his weight",
  "sop.effect.wean":
    "Weans the calf: a heifer stays on the dairy side, a bull calf goes to the fattening pen chosen",
  "sop.effect.stays": "Stays as a heifer",
  "sop.effect.calving": "Calving",
  "sop.effect.stock_count": "Counts the store",
  "sop.effect.medicine_count": "Counts the medicine",
  "sop.effect.head_count": "Counts the pen against the register",
  "sop.effect.cash_count": "Counts the cash in hand",
  "sop.effect.lot_number": "The vial's lot Number, once for the campaign",
  "abortion.title": "Abortions",
  "abortion.stage": "{months, plural, one {# month} other {# months}} along",
  "abortion.when": "When",
  "abortion.stageMonths": "How many months along",
  "abortion.note": "Vet's note",
  "abortion.voidIt":
    "Take it away: it was not hers. Her pregnancy is found again with a check",
  "abortion.record": "Record an abortion",
  "abortion.recorded": "Abortion recorded",
  "refusal.abortionOfACowNotCarrying":
    "She is not carrying, so there is no pregnancy to lose",
  "repeatBreeder.title": "Cows that will not settle",
  "repeatBreeder.failedAttempts":
    "{count, plural, one {# heat} other {# heats}} served that did not take",
  "repeatBreeder.lastAnswer": "Last decided: {decision} — {note}",
  "repeatBreeder.decision": "Decision",
  "repeatBreeder.why": "Why",
  "repeatBreeder.answer": "Record the decision",
  "repeatBreeder.why.checked_negative": "the vet found her empty",
  "repeatBreeder.why.back_in_heat": "back in heat",
  "repeatBreeder.answered": "Decision recorded",
  "refusal.notARepeatBreeder": "She is not waiting for a decision",
  "refusal.abortedInTheFuture": "An abortion cannot be later than now",
  "refusal.abortedBeforeSheWasServed":
    "An abortion cannot be earlier than the service it ends",
  "repeatBreeder.serve_again": "Serve her again",
  "repeatBreeder.treat": "Treat her first",
  "repeatBreeder.cull": "Cull her",
  "calving.title": "Calvings",
  "calving.dam": "Mother",
  "calving.lactation": "Lactation {number}",
  "milk.herLactationHint":
    "What she has given in it, over the {days, plural, one {# day} other {# days}} she was milked here.",
  "milk.inAll": "In all",
  "milk.perDay": "A day, on average",
  "milk.lately": "A day, this last week",
  "milk.bestDay": "Her best day",
  "calving.stillborn": "stillborn",
  "calving.ease.unassisted": "Unassisted",
  "calving.ease.assisted": "Assisted",
  "calving.ease.vet": "With the vet",
  "calving.col.ease": "How it went",
  "calving.col.lactation": "Lactation",
  "refusal.staffOrManagerOnly":
    "A calving is recorded by barn staff or the manager",
  "refusal.calvingOfACowNotInCalf": "She is not a cow who calves",
  "refusal.calvingOfAMale": "A bull does not calve",
  "refusal.calvedInTheFuture": "A calving cannot be later than now",
  "sop.trigger.registrationRenewal": "the registration coming up for renewal",
  "sop.trigger.beforeCalving": "Before a cow's expected calving",
  "sop.trigger.farmTimed": "The farm's days, set once for every cow",
  "calvingLead.dry_off": "Dry-off lead",
  "calvingLead.calving_prep": "Calving-prep lead",
  "refusal.expectedCalvingNeeded":
    "A Pregnant Heifer needs the day she is expected to calve",
  "refusal.expectedCalvingPassed": "That day has already gone",
  "refusal.expectedCalvingTooFar":
    "No cow calves further off than a whole gestation",
  "refusal.expectedCalvingWithoutPregnancy":
    "Only a cow in calf is expected to calve",
  "refusal.calvingIsDerived":
    "This day comes from her service; correct the service or the check",
  "refusal.dryOffOfACowNotInMilk": "Only a cow in milk is dried off",
  "refusal.noCalvingExpected": "She is not expected to calve",
  "event.service":
    "A cow is served (the check falls due the farm's days later)",
  "refusal.vetOnly": "This is the vet's to record",
  "refusal.checkWithoutAService":
    "A pregnancy check is recorded on the work her latest service raised",
  "refusal.differenceNeedsReason": "Say why a count differs from the store",
  "refusal.countIncomplete": "Count every feed in the store",
  "pregnancy.title": "Pregnancy checks",
  "pregnancy.positive": "Carrying",
  "pregnancy.negative": "Not carrying",
  "pregnancy.ofService": "Of the service on {when}",
  "pregnancy.col.result": "Result",
  "pregnancy.col.servedOn": "Served on",
  "pregnancy.expectedCalving": "Expected calving: {when}",
  "pregnancy.failedAttempts": "Heats served that did not take: {count}",
  "heat.work": "AI work",
  "heat.title": "Heats",
  "heat.seen": "Seen in heat",
  "nav.intake": "Intake",
  "intake.title": "How it arrived",
  "intake.seller": "Seller",
  "intake.price": "Purchase price",
  "intake.market_toll": "Market toll",
  "intake.trip": "Came home on",
  "intake.groupTrip": "The outing",
  "intake.groupTripHint":
    "What the day cost beyond the animals themselves. Write it up once; every animal that came home on the lorry carries an equal share.",
  "intake.tripLivestockMarket": "Where it went",
  "intake.tripBroker": "Broker",
  "intake.tripTransport": "Lorry home",
  "intake.tripKeep": "Food and lodging",
  "intake.recordTrip": "Record the outing",
  "intake.tripRecorded":
    "The outing is written up, and this arrival came home on it",
  "intake.pastTrips": "Buying outings lately",
  "intake.cameHome": "{count} came home",
  "intake.newTrip": "New outing",
  "intake.noTrip": "No outing — bought at the farm gate",
  "intake.owner": "Whose animal she is",
  "intake.ownerHint":
    "The venture whose money bought her. Only a venture that is buying may take one in.",
  "intake.ownerFromFloat": "Bought on {venture}'s float, so she is {venture}'s",
  "intake.ownerFromFarmFloat":
    "This outing went to the livestock market on the farm's own money, so she is the farm's.",
  "intake.farmFloat": "on the farm's money",
  "intake.paidFromTheAccount": "Paid from the venture account by bank",
  "intake.reference": "Check or transfer number",
  "intake.paidOn": "Day the bank moved it",
  "intake.ventureAtTheGate":
    "A venture's bull bought with no outing is the owner's to take in: it is paid from the venture account by bank.",
  "intake.theFarms": "The farm's own",
  "intake.weight": "Weight on arrival",
  "intake.age": "Estimated age",
  "intake.targetWeight": "Target weight",
  "intake.targetWindow": "Target window",
  "intake.money": "{amount} {currencySum}",
  "intake.kg": "{kg} kg",
  "intake.months": "{months, plural, one {# month} other {# months}}",
  "intake.pen": "Pen",
  "intake.penHint": "It starts in quarantine, in a quarantine pen.",
  "intake.arrivedAt": "When she came",
  "intake.arrivedAtHint": "Leave empty if she came off the lorry just now",
  "intake.noQuarantinePen":
    "The farm has no quarantine pen marked yet — a bought animal comes in only through one. Mark a pen as a quarantine pen first.",
  "intake.markAQuarantinePen": "Go to sheds and pens",
  "intake.sellerName": "Seller's name",
  "intake.sellerPlace": "Seller's market or place",
  "intake.sellerPhone": "Seller's phone",
  "intake.windowStart": "Target window from",
  "intake.windowEnd": "Target window to",
  "intake.windowNote":
    "Left blank, the next Eid-ul-Adha is used; change it once the date is announced.",
  "intake.ventureWindow": "{from} – {to} — {venture}'s target window",
  "intake.ventureWindowNote":
    "A venture's animal is sold in the venture's target window; it moves only by an amendment its investors sign.",
  "intake.targetWeightNote":
    "Left blank, the farm's own target weight is used: no ration says what an animal this weight should gain.",
  "intake.suggested":
    "Your rations say {low}–{high} kg when the target window opens.",
  "intake.suggestedUsed": "Left blank, {kg} kg is used.",
  "intake.useSuggested": "Use {kg} kg",
  "intake.suggestedTarget": "{kg} kg — from your rations",
  "intake.photoLater":
    "The photo did not go up — take it again from the animal's page.",
  "intake.record": "Take it in",
  "intake.noPhoto": "No photo yet",
  "intake.subtitle":
    "A bought animal comes in: where it goes, who sold it, what it cost, and what it should weigh when it leaves.",
  "intake.groupAnimal": "The animal",
  "intake.groupSeller": "The seller",
  "intake.groupPrice": "Price, weight and age",
  "intake.groupTarget": "Target",
  "intake.recorded": "{tag} is on the farm",
  "intake.groupAnimalHint": "Which pen it goes into first, and what it is.",
  "intake.groupSellerHint":
    "A name is enough; the rest is what anyone remembers.",
  "intake.groupPriceHint":
    "What was paid, what the scale read off the lorry, and the age the seller gave.",
  "intake.groupTargetHint":
    "What it is being fed towards, and when the farm means to sell it.",
  "intake.lastBuys":
    "the farm's {animals, plural, one {# buy} other {# buys}} near this weight in the last {days, plural, one {# day} other {# days}} averaged {currencySign}{amount} per kg",
  "intake.lastBuysOver": "this one is {percent}% dearer",
  "intake.lastBuysUnder": "this one is {percent}% cheaper",
  "intake.lastBuysSame": "this one is about the same",
  "intake.perKg": "{currencySign}{amount} per kg",
  "intake.summary": "What will be recorded",
  "intake.summaryHint":
    "Check it against the seller's slip before taking it in.",
  "intake.farmsOwn": "The farm's own target weight",
  "intake.farmsTarget": "{kg} kg — the farm's own",
  "intake.nextEid": "{from} – {to} — the next Eid-ul-Adha",
  "eid.title": "Next Eid-ul-Adha",
  "eid.allDates": "All Eid-ul-Adha dates",
  "eid.basis.announced": "Announced",
  "eid.basis.expected": "Expected",
  "eid.basis.estimated": "Estimated",
  "eid.basisHint.announced": "The day the moon sighting committee announced.",
  "eid.basisHint.expected":
    "The day the farm's list expects. Write the day in once the moon sighting committee announces it.",
  "eid.basisHint.estimated":
    "Past the end of the farm's list, so this is the calendar's guess. Write the day in once it is announced.",
  "eid.daysToGo": "{days, plural, one {# day} other {# days}} to go",
  "eid.qurbaniOn": "Qurbani is on",
  "eid.announce": "Write in the announced day",
  "eid.announceHint":
    "The day the moon sighting committee announced for Eid. Animals taken in from now on are fed towards it.",
  "eid.announceDay": "Eid day",
  "eid.announced": "Eid day written in",
  "eid.behind":
    "{count, plural, one {# of the farm's animals is} other {# of the farm's animals are}} still aimed at an earlier day for this Eid",
  "eid.bringAlong": "Move them to the Eid's days",
  "eid.broughtAlong":
    "{count, plural, one {# animal} other {# animals}} moved to the Eid's days",
  "eid.inVentures":
    "{count, plural, one {# animal in a venture keeps its window} other {# animals in ventures keep their window}}: a venture's window moves only by an amendment its investors sign.",
  "eid.listSubtitle":
    "Every Eid the fattening side sells into: the day the farm is on for each, how it knows it, and the animals aimed at it. Write in the committee's day once it is announced.",
  "eid.of": "Eid-ul-Adha {year}",
  "eid.col.eid": "Eid",
  "eid.col.days": "The farm's days",
  "eid.col.expected": "Expected day",
  "eid.col.when": "When",
  "eid.next": "Next",
  "eid.over": "Over",
  "eid.correct": "Correct the day",
  "eid.withdraw": "Take the announcement back",
  "eid.withdrawTitle": "Take back the day announced for {eid}?",
  "eid.withdrawWhy":
    "The Eid goes back to the day expected, as if nobody had announced it. Animals already moved to the announced day stay there until you move them.",
  "eid.withdrawn": "Announcement taken back",
  "eid.aimedInVentures": "{count} in ventures",
  "eid.none": "No Eid to list",
  "refusal.notAnEid":
    "That day is no Eid-ul-Adha the farm expects. Check the year.",
  "refusal.eidNotAnnounced":
    "Nobody has written in the announced day for that Eid yet",
  "refusal.noEidAhead":
    "The farm has no Eid date that far ahead. Type the days to sell in.",
  "intake.stillNeeded": "Still to fill in",
  "intake.windowHalf":
    "Give both days of the target window, the first before the last — or leave both blank.",
  "intake.recent": "Recently taken in",
  "intake.recentHint":
    "The newest on the fattening side — check the animal in front of you has not already been written up.",
  "intake.recentEmpty": "Nothing taken in yet",
  "nav.fattening": "Fattening",
  "gain.title": "Gain and projection",
  "gain.daysOnFeed": "Days on feed",
  "gain.now": "Weighs now",
  "gain.sinceIntake": "Since intake",
  "gain.recent": "Lately",
  "gain.col.gain": "Gain",
  "gain.perDay": "{kg} kg/day",
  "gain.projected": "{kg} kg at Eid",
  "gain.onTrack": "Makes the target",
  "gain.behind": "Short of the target",
  "gain.needsTwo": "No two weights far enough apart yet — no rate",
  "gain.noneYet": "Not weighed yet",
  "gain.slowing": "Slower than before",
  "gain.empty": "Nothing on the fattening side yet",
  "gain.subtitle":
    "Who will make their target weight, and who will not — worked out from intake and weigh-ins, never typed.",
  "gain.emptyHint":
    "Animals appear here once they are taken in, or weaned onto the fattening side.",
  "gain.onSide": "On the fattening side",
  "gain.noRate": "No rate yet",
  "gain.all": "All",
  "gain.noneInFilter": "No animal in this group",
  "gain.col.standing": "Against the target",
  "gain.kpi.onSideHint": "In quarantine, fattening or ready for sale",
  "gain.kpi.behindHint": "At the rate they are gaining now",
  "gain.kpi.onTrackHint": "By the time their target window opens",
  "gain.kpi.noRateHint": "Weighed once, or not yet",
  "gain.filterPen": "Filter by pen",
  "gain.allPens": "All pens",
  "nav.ready": "Ready for sale",
  "ready.none": "Nothing is being suggested for sale",
  "ready.because.weight": "Reached its target weight",
  "ready.because.window": "Its target window has opened",
  "ready.confirm": "Yes, ready",
  "ready.confirmed": "{tag} is ready for sale",
  "ready.setAside": "Keep it longer",
  "ready.setAsideWhy": "Why it is staying",
  "ready.setAsideDone": "{tag} is staying for now",
  "ready.underWithdrawal": "Cannot be sold before {when}",
  "ready.col.why": "Why",
  "ready.subtitle":
    "The farm suggests, you decide: confirm an animal ready for sale, or keep it longer and say why.",
  "ready.noneHint":
    "An animal is suggested once it reaches its target weight or its target window opens.",
  "ready.windowClosed": "Its target window has passed",
  "ready.filter.weight": "Target weight",
  "ready.filter.window": "Target window",
  "ready.setAsideTitle": "Keep {tag} longer",
  "ready.setAsideHint":
    "Say why it is staying. The farm stops suggesting it until something new holds.",
  "ready.kpi.suggested": "Suggested",
  "ready.kpi.suggestedHint": "Waiting for your answer",
  "ready.kpi.confirmed": "Confirmed ready",
  "ready.kpi.confirmedHint": "{count} can be sold today",
  "ready.kpi.held": "Held by withdrawal",
  "ready.kpi.heldHint": "Cannot be confirmed or sold yet",
  "nav.sale": "Sales",
  "nav.culling": "Culling",
  "nav.fertility": "Fertility",
  "fertility.subtitle":
    "How quickly the cows get back in calf over the last year, against what DLS asks of a dairy.",
  "fertility.calvingInterval": "Calving interval",
  "fertility.daysOpen": "Days open",
  "fertility.toFirstService": "Calving to first service",
  "fertility.conceptionRate": "Attempts that took",
  "fertility.ageAtFirstCalving": "Age at first calving",
  "fertility.days": "{days, plural, one {# day} other {# days}}",
  "fertility.months": "{months, plural, one {# month} other {# months}}",
  "fertility.target":
    "DLS: {low}–{high, plural, one {# day} other {# days}} · from {count}",
  "fertility.ofAttempts":
    "Of {count, plural, one {# Attempt} other {# Attempts}} whose outcome is known",
  "fertility.fromFirstCalvings":
    "From {count, plural, one {# first calving} other {# first calvings}}",
  "dryOff.title": "Dry-offs and dry periods",
  "dryOff.hint":
    "How long the cows stood dry before calving again, and how long they milked before it, over the last year. Only dry-offs recorded here count.",
  "dryOff.dryPeriod": "Dry period",
  "dryOff.lactationLength": "Milked before dry-off",
  "dryOff.target":
    "Aim {low}–{high, plural, one {# day} other {# days}} · from {count}",
  "dryOff.outside":
    "Dry periods outside {low}–{high, plural, one {# day} other {# days}}",
  "dryOff.outsideLine":
    "{days, plural, one {# day} other {# days}} dry after lactation {number}",
  "milk.herLactations": "Her lactations",
  "milk.herLactationsHint":
    "How long she milked in each, and how long she stood dry before the next calving.",
  "milk.calvedOn": "Calved {date}",
  "milk.driedOn": "Dried off {date}",
  "milk.inMilkNow": "In milk now",
  "milk.dryOffUnknown": "Dry-off not recorded",
  "milk.daysInMilkOf": "{days, plural, one {# day} other {# days}} in milk",
  "milk.daysDry": "{days, plural, one {# day} other {# days}} dry",
  "milk.daysDrySoFar":
    "dry for {days, plural, one {# day} other {# days}} so far",
  "heifers.title": "Heifers growing",
  "heifers.hint":
    "Each heifer not yet in calf, against the 250 kg DLS has her first served at — by 18 months for a cross, 30 for a deshi heifer — at the gain she has kept up. Those who will fall short first.",
  "heifers.col.age": "Age",
  "heifers.col.weight": "Last weighed",
  "heifers.col.gain": "Gain",
  "heifers.col.atService": "At service age",
  "heifers.behind": "Falling short",
  "heifers.reached": "Heavy enough",
  "heifers.onTrack": "On track",
  "heifers.notWeighed": "Not weighed yet",
  "heifers.atAge": "{kg} at {months}",
  "fertility.byMonth": "Month by month",
  "fertility.cows": "Each cow since she calved",
  "fertility.cowsHint":
    "Cows in milk or dry, the longest open first. Past 85 days open is past what DLS asks.",
  "fertility.attemptsCount":
    "{count, plural, one {# Attempt} other {# Attempts}} since",
  "fertility.col.month": "Month",
  "fertility.col.calved": "Calved",
  "fertility.col.attempts": "Attempts",
  "fertility.col.lastInterval": "Last interval",
  "nav.months": "Monthly report",
  "months.subtitle":
    "How the farm has done each month, over the last 12 months or a financial year you pick: its money, the milk against what the dairy cows cost, the fattening animals sold, and each venture against its plan.",
  "months.net": "Net over the year",
  "months.whichYear": "Which months",
  "months.lastTwelve": "Last 12 months",
  "months.financialYear": "Financial year {year}",
  "months.financialYearSoFar": "Financial year {year}, so far",
  "months.yearNotBegun":
    "That financial year has not begun yet. Pick another one above.",
  "months.milkSold": "Milk sold over the year",
  "months.milkSoldHint": "{liters} L · a liter fetched {fetched}",
  "months.dairyCost": "What the dairy cows cost",
  "months.dairyCostHint": "{perLiter} a liter sent to bulk",
  "months.margins": "Margins on fattening sold",
  "months.marginsHint":
    "{count, plural, one {# animal sold} other {# animals sold}}",
  "months.nothingYet": "Nothing yet",
  "months.chartTitle": "Net money each month",
  "months.chartHint":
    "The farm's own money in less money out; a venture's money is its own.",
  "months.chartHintSoFar":
    "The farm's own money in less money out; a venture's money is its own. This month is so far.",
  "months.chartSaid": "{month}: net {net}",
  "months.tableTitle": "Each month",
  "months.tableHint":
    "Money is what moved in and out of the farm's purse. What a side cost is what its animals were fed, dosed and visited for in the month, whenever it was bought. The farm's own animals only: a venture's are on its own line below.",
  "months.col.month": "Month",
  "months.col.venture": "Venture",
  "months.col.planned": "Planned",
  "months.col.now": "Now: made or projected",
  "months.col.milk": "Milk sold",
  "months.col.dairyCost": "Dairy cows cost",
  "months.col.liter": "A liter fetched · cost",
  "months.col.perCow": "Per cow, a day",
  "months.col.sold": "Fattening sold · Margin",
  "months.col.fatteningCost": "Fattening cost",
  "months.col.overheads": "Running the farm · a head a day",
  "months.cardOverheads": "Running the farm {amount}, {perHead} a head a day",
  "months.yearOverheads":
    "Running the farm over the year: {amount}, {perHead} a head a day over every animal here, the ventures' among them. Wages, rent and electricity: no side, season or venture above carries it.",
  "months.soFar": "so far",
  "months.one.title": "Monthly report — {month}",
  "months.one.subtitle":
    "How the farm did in one month, beside the month before: the farm's own money, the milk, fattening and overheads.",
  "months.one.whichMonth": "Which month",
  "months.one.line": "Figure",
  "months.one.money": "The farm's money",
  "months.one.moneyHint":
    "The farm's own money, added up as the accountant's summary adds it; categories and sides for this month only.",
  "months.one.byCategory": "Category",
  "months.one.bySide": "Side",
  "months.one.wholeFarm": "Whole farm",
  "months.one.noMoney": "The farm's money did not move this month.",
  "months.one.dairy": "Dairy",
  "months.one.dairyHint":
    "Milk sold, what a liter fetched, and what the farm's own cows cost.",
  "months.one.litersSold": "Liters sold",
  "months.one.fetchedPerLiter": "Fetched a liter",
  "months.one.litersToBulk": "Milk to bulk",
  "months.one.costPerLiter": "Cost a liter",
  "months.one.fattening": "Fattening",
  "months.one.fatteningHint":
    "What the farm's own fattening animals cost, and the whole-life margins of those sold this month.",
  "months.one.sold": "Animals sold",
  "months.one.margins": "Their margins",
  "months.one.overheads": "Overheads",
  "months.one.overheadsHint":
    "What running the place cost, charged to no side; and what that came to a head a day.",
  "months.one.overheadsAmount": "In the month",
  "months.one.perHeadPerDay": "A head a day",
  "months.one.results": "What each side came to",
  "months.one.resultsHint":
    "What each side brought in, less what its animals were charged, then less its share of the overheads by the days the farm's own animals stood on it. Not the farm's profit, which its accountant's full books say.",
  "months.one.broughtIn": "Brought in",
  "months.one.beforeOverheads": "Before overheads",
  "months.one.margin": "Margin",
  "months.one.overheadsShare": "Share of overheads",
  "months.one.afterOverheads": "After overheads",
  "months.one.venturesDays": "The ventures' animals' days",
  "months.one.receivables": "Owed at the month's end, by age",
  "months.one.receivablesHint":
    "What buyers still owed on the month's last day, by the days since each sale or milk dispatch left, and what of it was past the day promised.",
  "months.one.age.0-7": "0–7 days",
  "months.one.age.8-15": "8–15 days",
  "months.one.age.16-30": "16–30 days",
  "months.one.age.31-60": "31–60 days",
  "months.one.age.over-60": "Over 60 days",
  "months.one.owedInAll": "Owed in all",
  "months.one.ofItOverdue": "Of it overdue",
  "months.one.store": "The store at the month's end",
  "months.one.storeHint":
    "What the store held on the month's last day: the feed at its average price, the medicine at what a dose cost — the prices the animals are charged at.",
  "months.one.feed": "Feed",
  "months.one.medicine": "Medicine",
  "months.one.storeInAll": "The store in all",
  "months.one.storeUnpriced":
    "{amount, plural, one {# feed or medicine was in the store at the month's end with no price, and is not in its worth} other {# feeds or medicines were in the store at the month's end with no price, and are not in its worth}}",
  "months.one.cashFlow": "Cash flow",
  "months.one.cashFlowHint":
    "The farm's own money, from where the month began to where it ended. What moved without passing a hand or an account the farm names — a cash count's difference, money booked to nobody's hand, an account read for the first time — is said, so the lines add up.",
  "months.one.began": "Where the month began",
  "months.one.movedBesides": "Moved without a hand or an account",
  "months.one.ended": "Where the month ended",
  "months.one.cash": "The farm's own money at the month's end",
  "months.one.cashHint":
    "Every note in the hands, less a venture's sale cash not yet deposited and its buying floats, which are the ventures' and never the farm's to spend; and each farm account's balance worked out from its statements.",
  "months.one.inHands": "Notes in the hands",
  "months.one.venturesInHands": "Of it the ventures'",
  "months.one.farmsInHands": "The farm's own in the hands",
  "months.one.inAccounts": "In the farm's accounts",
  "months.one.farmsOwn": "The farm's own in all",
  "months.one.accountsNotRead":
    "{amount, plural, one {# farm account was not yet read once against its statement, and counts nothing} other {# farm accounts were not yet read once against their statements, and count nothing}}",
  "months.one.capital": "Capital employed at the month's end, at cost",
  "months.one.capitalHint":
    "The farm's own money tied up on the month's last day, cash apart: each fattening animal at her price and every charge to her; each dairy animal at her entry price and her keep until she first calved; the farm's capital in ventures still running; the store; what buyers owe. What they would fetch today is on Returns.",
  "months.one.dairyHerd": "The dairy herd",
  "months.one.fatteningAnimals": "Fattening animals",
  "months.one.inVentures": "In ventures",
  "months.one.theStore": "The store",
  "months.one.owedByBuyers": "Owed by buyers",
  "months.one.capitalInAll": "Capital in all",
  "months.one.unpricedAnimals":
    "{amount, plural, one {# animal was never priced, and counts in the capital at its charges alone} other {# animals were never priced, and count in the capital at their charges alone}}",
  "months.one.monthsReturn": "What the capital made this month",
  "months.one.monthsReturnHint":
    "Each side's result after overheads over the mean of its capital where the month began and ended. A ventures' return comes at its settlement, never in a month; an animal bought and sold inside the month leaves no capital at either end.",
  "months.one.farmVenturesApart": "Whole farm, ventures apart",
  "months.one.per100": "{amount} taka on every 100",
  "months.one.glance": "The month at a glance",
  "months.one.glanceHint":
    "What came in and what it came to after the overheads, then where the farm stood at the month's end — each beside the month before, and the change.",
  "months.one.change": "Change",
  "months.one.points": "{amount, plural, one {# point} other {# points}}",
  "months.one.marginAfter": "Margin after overheads",
  "months.one.dairyAfter": "Dairy, after overheads",
  "months.one.fatteningAfter": "Fattening, after overheads",
  "months.one.farmsOwnMoney": "The farm's own money",
  "months.one.venturesTitle": "Ventures",
  "months.one.ventures":
    "Each venture keeps its own accounts, so none are above; each has its own page.",
  "months.one.noVentures": "No venture ran this month.",
  "months.one.soFarTo": "so far, to {day}",
  "months.one.notBegun": "This month has not begun.",
  "months.one.noSuchMonth": "There is no such month.",
  "months.pair": "{first} · {second}",
  "months.cardMilk": "Milk sold {sold} · the dairy cows cost {cost}",
  "months.cardLiter": "A liter fetched {fetched} and cost {cost}",
  "months.cardSold":
    "{count, plural, one {# fattening animal sold} other {# fattening animals sold}}, Margin {margin} · the fattening animals cost {cost}",
  "months.cardNoneSold":
    "No fattening sold · the fattening animals cost {cost}",
  "months.awaiting":
    "Money still waiting for your approval is counted, as the accountant's summary counts it.",
  "months.venturesTitle": "Ventures against their plan",
  "months.venturesHint":
    "What each plan said it would make, beside what it is projected to make now, or what it made once it settled.",
  "months.planned": "Planned {range}",
  "months.projectedNow": "Projected now {range}",
  "months.made": "Made {profit}",
  "months.noPlan": "No plan yet",
  "months.nothingProjected": "Nothing projected",
  "months.noVentures": "No ventures yet",
  "months.returnsLink": "What each season and venture returned",
  "months.col.afterOverheads": "After overheads",
  "months.returnsTitle": "Return on cost, as it stands today",
  "months.returnsHint":
    "A season's, a venture's and the herd's whole run, never a month's: what every hundred taka they cost has made, or is making at today's prices. Read in full on Returns.",
  "nav.returns": "Returns",
  "window.title": "The season she joins",
  "window.nextEid": "The next Eid-ul-Adha",
  "window.nextEidHint": "The farm puts in its days, announced or expected.",
  "window.other": "Another window",
  "window.from": "From",
  "window.to": "To",
  "refusal.seasonNotFinished":
    "This season is still going; it opens out once the last animal has gone",
  "refusal.noSuchSeason": "There is no such season",
  "refusal.bredHereNeedsNoPrice":
    "One bred here is counted from her birth, at nothing; she needs no price",
  "refusal.headPriceBackwards":
    "A head price needs a low above nothing and no higher than its high",
  "sale.title": "Sell an animal",
  "papers.passport": "Passport",
  "papers.withdrawalSummary": "Withdrawal summary",
  "sale.animal": "Which animal",
  "sale.today": "Sold today",
  "sale.receipt": "Receipt",
  "sale.transportCard": "Transport card",
  "sale.noneToday": "Nothing sold today",
  "sale.missing.animal": "Choose the animal.",
  "sale.missing.buyer": "Write the buyer's name.",
  "sale.missing.price": "Write what she sold for.",
  "sale.missing.weight": "Write what she weighed on the day.",
  "sale.missing.paidNow": "Write what the buyer paid now — 0 if nothing.",
  "sale.missing.destination": "Write where she is going.",
  "sale.missing.vehicle": "Write the vehicle's number.",
  "sale.missing.driver": "Write the driver's name.",
  "sale.missingRegistration":
    "The farm's registration number is not recorded, so no transport card can be given. Write it on the farm identity page.",
  "sale.otherAnimal": "An animal not on the list",
  "sale.noneToSell":
    "No animal can be sold today: none is here and out of her meat withdrawal",
  "sale.fromList": "Choose from the list",
  "sale.buyerName": "Buyer's name",
  "sale.buyerAddress": "Buyer's address",
  "sale.buyerPhone": "Buyer's phone",
  "sale.brokerPaid": "Broker's fee",
  "sale.broker": "Broker's fee ({currencySign})",
  "sale.brokerHint":
    "What the broker at the livestock market took for this sale, if one was used. The farm pays it; it is this animal's cost.",
  "sale.price": "Sale price",
  "sale.weight": "Weight on the day",
  "sale.destination": "Where she is going",
  "sale.vehicle": "Vehicle",
  "sale.driver": "Driver",
  "sale.note": "Note",
  "sale.noteWhy": "Why she is going — a culled animal's reason belongs here",
  "sale.record": "Record the sale",
  "sale.subtitle":
    "Pick a Ready animal, name the buyer, and hand over the receipt and the transport card.",
  "sale.groupAnimal": "The animal",
  "sale.groupBuyer": "The buyer",
  "sale.groupPrice": "Price and weight",
  "sale.groupTransport": "The lorry",
  "sale.todayHint":
    "Print a receipt once the buyer has finished — it covers everything he took today.",
  "sale.done": "{tag} is sold",
  "sale.again": "Use the last buyer and lorry again",
  "sale.noneReady": "Nothing is ready for sale",
  "sale.soldOn": "Sold on",
  "sale.soldAt": "When she left",
  "sale.soldAtHint": "Leave empty if she left just now",
  "sale.howSheLeft": "How she left the farm",
  "sale.soldTo": "Buyer",
  "sale.sheetDescription":
    "Who took her, for how much, and the lorry she went on. The price goes to the money register.",
  "sale.lastWeighedOn": "Last weighed {kg} kg on {day}",
  "sale.shrinkLost": "{kg} kg lighter today ({percent}%)",
  "sale.shrinkGained":
    "{kg} kg heavier than her last weighing: check the scale",
  "sale.shrinkStale":
    "(that weighing was {days, plural, one {# day} other {# days}} before)",
  /** Receivable at the gate: a buyer who paid part of it, or none, now. */
  "calves.title": "Calves in the last 12 months",
  "calves.hint":
    "DLS counts more than one in ten lost before weaning as too many.",
  "calves.bornAlive": "Born alive",
  "calves.stillborn": "Born dead",
  "calves.lost": "Lost before weaning",
  "calves.lostShare":
    "{share}% of the {count, plural, one {# calf} other {# calves}} old enough to wean were lost before weaning",
  "calves.causes": "What they died of: {causes}",
  "calf.firstDay": "Her first day",
  "calf.firstDayHint":
    "What was done for her in the hours after she was born: colostrum, navel, weight.",
  "calf.done": "Done",
  "receivable.someOwed": "Some of it is still owed (on credit)",
  "receivable.paidNow": "Paid now ({currencySign})",
  "receivable.stillOwes": "Still owes {currencySign}{amount}",
  "receivable.promisedBy": "Promised to pay by",
  "receivable.promisedByOptional": "Promised to pay by, if he named a day",
  "receivable.owedBy": "{currencySign}{amount} still owed, promised by {day}",
  "receivable.owed": "{currencySign}{amount} still owed",
  "receivable.tab": "Receivables",
  "receivable.nobody": "Nobody owes the farm anything",
  "receivable.nobodyHint":
    "A sale or milk left partly paid shows here until the buyer pays.",
  "receivable.owingTotal": "Owed to the farm",
  "receivable.owingTotalHint":
    "{count, plural, one {# buyer} other {# buyers}}",
  "receivable.since": "since {day}",
  "receivable.col.since": "Owed since",
  "receivable.col.writtenOff": "Written off",
  "receivable.col.owing": "Still owed",
  "receivable.promised": "promised by {day}",
  "receivable.paidAhead": "{currencySign}{amount} paid ahead",
  "receivable.kind.cattle": "Cattle",
  "receivable.kind.milk": "Milk",
  "receivable.itemOwes":
    "{currencySign}{owing} of {currencySign}{receivable} still owed",
  "receivable.itemPaidOff": "Paid off",
  "receivable.liters":
    "{liters, plural, one {# liter} other {# liters}} of milk",
  "receivable.paymentLine": "{currencySign}{amount} paid on {day}",
  "receivable.writeOffLine": "{currencySign}{amount} written off on {day}",
  "receivable.record": "Record a payment",
  "receivable.paymentTitle": "Money received towards a receivable",
  "receivable.correctPhone": "Put his phone right",
  "receivable.paymentDescription":
    "What he paid, for what, and when. It clears his oldest receivable first.",
  "receivable.buyer": "Buyer",
  "receivable.kind": "For",
  "receivable.amount": "Amount ({currencySign})",
  "receivable.paidOn": "Paid on",
  "receivable.note": "Note",
  "receivable.noteHint": "Needed if he paid more than he owes",
  "receivable.recorded": "Payment recorded",
  "receivable.buyerOwes":
    "{name} still owes {currencySign}{amount}, since {day}",
  "receivable.buyerOverdue":
    "{name} owes {currencySign}{amount} and is overdue since {day} — think before selling on credit",
  "home.receivableOverdue": "Overdue receivables",
  "receivable.writeOff": "Write off",
  "receivable.writeOffTitle": "Write this receivable off",
  "receivable.writeOffDescription":
    "Only when it will not be paid. What the animal or the milk fetched drops by it, and the buyer carries the mark. If he pays after all, it is put back.",
  "receivable.writeOffWhy": "Why it will not be paid",
  "receivable.writtenOff": "{currencySign}{amount} written off",
  "receivable.writtenOffDone": "Written off",
  "receivable.buyerWrittenOff":
    "{currencySign}{amount} of {name}'s written off on {day}",
  "home.receivableOverdueSince": "{currencySign}{amount} overdue since {day}",
  "home.receivableSoldAgain": "Sold on credit again while overdue",
  "money.from.receivablePayment": "Receivable paid",
  "sale.tab.ready": "Ready to go",
  "sale.sellThis": "Sell",
  "sale.noneReadyHint":
    "Confirm an animal ready for sale first — or name a culled cow by her tag from the sale button.",
  "sale.col.time": "Time",
  "sale.col.lastWeighed": "Last weighed",
  "sale.rowActions": "{tag} — papers",
  "sale.kpi.sold": "Sold today",
  "sale.kpi.soldHint": "To {count, plural, one {# buyer} other {# buyers}}",
  "sale.kpi.takings": "Taken today",
  "sale.kpi.takingsHint": "What today's buyers paid",
  "sale.kpi.perKg": "Per kg today",
  "sale.kpi.perKgHint": "On the weights on the day",
  "sale.kpi.ready": "Ready to go",
  "sale.kpi.readyHint": "Confirmed, and clear of withdrawal",
  "nav.identity": "Farm settings",
  "settings.section.farm": "Farm details",
  "settings.section.rules": "Rules and alerts",
  "settings.section.money": "Money",
  "settings.section.portal": "Investor portal",
  "settings.section.eid": "Eid-ul-Adha dates",
  "settings.section.years": "Financial year",
  "months.noSuchYear":
    "No financial year begins in that month. Pick one above.",
  "settings.rulesWhy":
    "How the farm behaves: when its digest goes and its quiet hours, how far a reading may drift, how long late work waits before somebody is told, and when a cow is put on the cull list. Every change is kept in the audit log.",
  "settings.moneyWhy":
    "The accounts the farm takes and pays through, the categories every entry is written under, and the market price its own animals are priced at.",
  "identity.why":
    "Every paper that leaves the farm — the transport card, the letter to the office — prints what is written here.",
  "setupLeft.title": "Setting the farm up",
  "setupLeft.hint": "Each goes from this list once it is done.",
  "setupLeft.step.identity": "Write the farm's address and phone",
  "setupLeft.step.registration": "Enter the DLS registration",
  "setupLeft.step.sheds": "Add the sheds and pens",
  "setupLeft.step.people": "Add the barn staff",
  "setupLeft.step.shedPhone": "Set up a shed phone",
  "setupLeft.step.register": "Put the herd in with the opening register",
  "setupLeft.step.playbook": "Publish the procedures the farm follows",
  "identity.name": "Farm name",
  "identity.nameHint":
    "Printed on every paper the farm sends out. Put right here, it is right on every paper from now on; those already sent keep what they said.",
  "identity.address": "Address",
  "identity.phone": "Phone",
  "identity.registrationNumber": "Registration number",
  "identity.registrationOffice": "Issuing office",
  "identity.registrationIssuedOn": "Issued on",
  "identity.registrationExpiresOn": "Expires on",
  "identity.save": "Save",
  "identity.saved": "The farm's identity is saved",
  "identity.nameEmpty":
    "The farm's name cannot be empty: it heads every paper the farm sends",
  "identity.missing":
    "No registration number written down — the transport card cannot be printed complete.",
  "identity.expired": "The registration ran out on {when}.",
  "identity.endingSoon": "The registration runs out on {when}.",
  "identity.contact": "Name and contact",
  "identity.contactHint":
    "Printed under the farm's name on every paper that leaves it.",
  "identity.registration": "DLS registration",
  "identity.registrationHint":
    "As the certificate prints it. The transport card and the inspector's papers carry the number.",
  "identity.unsaved": "Changes not saved yet",
  "identity.onThisPage": "On this page",
  "standsAside.movedSince": "She has been moved since this was done",
  "standsAside.cannotReturnToMilk": "She cannot be put back in milk from here",
  "standsAside.cannotUnwean":
    "A weaned calf cannot be made a calf again from here",
  "standsAside.cannotReturnToQuarantine":
    "He cannot be put back in quarantine from here",
  "standsAside.calvingActedOn": "The farm has acted on this calving since",
  "standsAside.serviceChecked":
    "The vet has checked this service; correct the check first",
  "standsAside.noRation":
    "This pen is on no ration now, so what was fed cannot be set against one",
  "standsAside.renewalSuperseded":
    "The registration has moved on since this renewal; put the newer one right instead",
  // Money and weights, said the same way to the Owner and to an Investor.
  "money.capitalIn": "Capital received",
  "money.payout": "Settlement payout",
  "money.payouts": "Settlement payouts",
  "money.refund": "Capital refunded",
  "money.refundedApart":
    "Apart from these, {amount} of capital refunded when a venture was canceled",
  "money.refundedHint": "When a Venture was canceled",
  "units.kg": "{kg} kg",
  "units.kgShort": "kg",
  "units.kgADay": "{kg} kg a day",
  "units.liters": "{liters} L",
  "alerts.animalMissing": "{tag} was not found on the round in {pen}, {since}",
  "home.missing": "Not found",
  "home.missingWhere": "{pen}, since {day}",
  "animals.missing": "Not found on the round in {pen} since {day}",
  "animals.missingHint":
    "Walk the farm, and mark this animal found here when you find it.",
  "animals.found": "Mark found",
  "animals.foundDone": "{tag} marked found",
  "owner.storeCount": "Store count",
  "owner.storeNotCounted": "The store has not been counted",
  "owner.storeLastCounted": "Last counted {day}",
  "owner.storeNeverCounted": "Never counted",
  "alerts.storeShortfall":
    "The store count on {day} came up {currencySign}{amount} short",
  "alerts.openTheCounts": "Open the counts",
  "alerts.medicineShort":
    "The medicine count on {day} came up {currencySign}{amount} short: doses gone that no treatment says were given",
  "alerts.ofThemVentures": " ({count} of them a venture's)",
  "alerts.stillHereAfterEid":
    "Qurbani from {day} is over, and {animals, plural, one {# animal} other {# animals}} aimed at it {animals, plural, one {is} other {are}} still on the farm{ofVentures}",
  "alerts.soldUnderCost":
    "{tag} was sold for {currencySign}{price}; she had cost {currencySign}{cost}, and her weight at the low price was {low}{basis}",
  "alerts.enteredTwice":
    "{by} entered {currencySign}{amount} to {name} on {day} a second time, knowing an entry the same was already there",
  "alerts.cashShort":
    "{name}'s cash count on {day} came up {currencySign}{amount} short",
  "alerts.arrivalWeightShort":
    "{tag} came off the lorry at {arrival} kg; at her first weighing {days, plural, one {# day} other {# days}} on she was {weighed} kg, {percent}% under — bought from {seller}",
  "alerts.largeShrink":
    "{tag} last weighed {last} kg ({day}); the sale's scale said {sale} kg — {percent}% lost",
  "alerts.mortalityRecorded":
    "{tag}{venture} {how} — cause: {cause}; she had cost {currencySign}{cost}",
  "alerts.mortalityUndiagnosed":
    "{tag} {how} — cause written: {cause}; no diagnosis named",
  "alerts.openTheEids": "Open the Eid list",
  "alerts.openTheMoney": "Open income and expenses",
  "alerts.openTheCash": "Open the cash in hand",
  "alerts.readTheProposals": "Read the proposals",
  "alerts.openTheProcedures": "Open the procedures",
  "alerts.openTheOutbox": "Open what is waiting to send",
  "alerts.openTheBackups": "Open the backups",
  "alerts.openTheStore": "Open the feed store",
  "alerts.openTheArrivals": "Open what came in",
  "alerts.openTheTrail": "Open the trail",
  "alerts.openTheMedicines": "Open the medicines",
  "alerts.openTheMilk": "Open the milk that does not add up",
  "params.storeShortfall": "A short store",
  "params.storeShortfallHint":
    "A weekly count that finds this much feed missing, at what the feed cost, is told to you and the manager.",
  "params.storeShortfallTellMoney": "Tell when a count is short by more than",
  "costs.storeShortfall": "Feed missing at the counts",
  "costs.storeShortfallHint":
    "What the Stock Counts found missing, at the store's price when counted. It is in no side's costs: nothing ate it.",
  "costs.storeShort": "Missing",
  "costs.storeOver": "Found over",
  "costs.storeCounts":
    "{count, plural, one {# count} other {# counts}} in the period",
  "event.unwell": "The round sees an animal unwell",
  "event.calved": "A cow calves",
  "event.unwell_urgent": "The round sees bloat or labored breathing",
  "unwell.seen": "What was seen",
  "alerts.penSoresSeen":
    "{animals, plural, one {# animal} other {# animals}} in {pen} seen with sores on the mouth or feet since {since}",
  "alerts.openObservations": "Open what was seen",
  "params.sores": "Sores in one pen",
  "params.soresHint":
    "When this many animals in one pen are seen with sores on the mouth or feet within these hours, you and the manager are told at once.",
  "params.soresTellAnimals": "Animals in one pen",
  "params.soresTellHours": "Within",
  "params.animals": "animals",
  "animals.outcomeSaid": "Saved how it ended",
  "animals.outcome.recovered": "Recovered",
  "animals.outcome.not_recovered": "Not recovered",
  "home.illAgain": "Ill again and again",
  "home.illAgainLine":
    "{count, plural, one {# diagnosis} other {# diagnoses}}; lately {disease}, {day}",
  "params.illAgain": "Ill again and again",
  "params.illAgainHint":
    "An animal the vet diagnoses this many times within these days is put on the manager's list, for the owner to weigh whether to keep treating it.",
  "params.illAgainDiagnoses": "Diagnoses",
  "params.illAgainDays": "Within",
  "params.diagnoses": "diagnoses",
  "refusal.outcomeSaid":
    "Its outcome is said already; put the diagnosis right to change it",
  "heatWatch.title": "Heat watch",
  "heatWatch.none": "No cow the farm is waiting to see in heat",
  "heatWatch.neverSeen":
    "{days, plural, one {# day} other {# days}} since calving, no heat seen · {pen}",
  "heatWatch.quietSince":
    "{days, plural, one {# day} other {# days}} since calving, no heat since {day} · {pen}",
  "heatWatch.heiferQuietSince":
    "Heifer served, no heat seen since {day} · {pen}",
  "heatWatch.calvingOverdue":
    "Was due to calve {day}, nothing recorded: have the vet look at her · {pen}",
  "heatWatch.returnDue": "Due back in heat — served {day} · {pen}",
  "params.heatWatch": "Heat watch",
  "params.heatWatchHint":
    "An open cow with no heat seen this many days after calving is put on the heat watch, for closer watching and the vet. DLS re-examines a cow not in heat by 50–60 days.",
  "params.heatWatchAfterCalvingDays": "From this day after calving",
  "givingLess.title": "Giving less",
  "givingLess.col.drop": "Less by",
  "givingLess.col.lately": "Lately (L a milking)",
  "givingLess.col.usually": "Usually (L a milking)",
  "givingLess.col.daysInMilk": "Days in milk",
  "givingLess.none": "No cow is giving well under her own week",
  "givingLess.line":
    "{lately} L a milking, usually {usually} L — {drop}% less · {pen}",
  "params.milkDrop": "A cow giving less",
  "params.milkDropHint":
    "A cow whose milk a milking falls this far under her own week, over these days, is named to the manager. A convention, not a measured line: it catches sudden illness, and a heat drops milk too.",
  "params.milkDropPercent": "Less than her week by",
  "params.milkDropDays": "Over the last",
  "alerts.milkUnaccounted":
    "{liters} L of milk since {since} is neither out of the gate nor in the tank ({percent}%)",
  "params.milkUnaccounted": "Milk not accounted for",
  "params.milkUnaccountedHint":
    "When this much of a week's milk into the tank has neither left the gate nor is still in the tank, you and the manager are told in the evening's post.",
  "params.milkUnaccountedPercent": "More than",
  "params.cashShort": "Cash count short",
  "params.cashShortHint":
    "When the weekly cash count finds this much less than the farm says the hand holds, you are told in the evening's post.",
  "params.cashShortTellMoney": "Tell when short by more than",
  "params.medicineShort": "Medicine count",
  "params.medicineShortHint":
    "The monthly count of the medicine, in doses: you are told when it comes up short, at what the doses cost, by more than this. Yours to set: the manager buys and counts it.",
  "params.medicineShortTellMoney": "Tell when short by more than",
  "params.feedDays": "Days of feed left",
  "params.feedDaysHint":
    "A feed with fewer days left than this, at the rate it has been fed over the last fortnight, is running low, and the manager is told in the evening's post.",
  "params.feedDaysLow": "Running low under",
  "params.putOff": "Work put off",
  "params.putOffHint":
    'When a Release or an arrival dose is skipped as "later", or not done, it comes round again after this many days — until it is done.',
  "params.putOffDays": "After",
  "params.feedPrice": "Feed bought dearer",
  "params.feedPriceHint":
    "When a feed is bought at this much more per unit than the last time it was bought, you are told in the evening's post.",
  "params.feedPriceJumpPercent": "More than",
  "params.arrivalShort": "Weighed under what was bought",
  "params.arrivalShortHint":
    "When a bought animal's first weighing, within her first thirty days, comes this much under the weight she was bought at, you are told in the evening's post.",
  "params.arrivalShortPercent": "More than",
  "params.shrink": "Weight lost at sale",
  "params.shrinkHint":
    "What a lorry, a livestock market and a night without water may take off an animal between her last weighing and the sale's scale. Past it you are told in the evening's post, and a sale's low price is never worked on less than her last weighing less this.",
  "params.shrinkTellPercent": "More than",
  "params.missing": "Missing animals",
  "params.missingHint":
    "How long an animal the round cannot find stays missing before you are asked whether to write it off as lost. You can write it off sooner from its page.",
  "params.missingWriteOffDays": "Ask after",
  "milkAccount.title": "The week's milk",
  "milkAccount.hint":
    "Into the tank since {since}, against what left the gate, allowing for what is in the tank.",
  "milkAccount.carriedIn": "In the tank when the week began",
  "milkAccount.toBulk": "Into the tank",
  "milkAccount.dispatched": "Out of the gate",
  "milkAccount.stillInTank": "Still in the tank",
  "milkAccount.notAccounted": "Not accounted for",
  "milkAccount.calves":
    "To calves: {liters} L a day for {calves, plural, one {# calf} other {# calves}} — {perCalf} L each",
  "params.firstServiceMonths": "A crossbred heifer served by",
  "params.deshiFirstServiceMonths": "A deshi heifer served by",
  "params.months": "months",
  "heatWatch.heiferNotServed":
    "Heifer, {age, plural, one {# month} other {# months}} old, not yet served — due by {due, plural, one {# month} other {# months}} · {pen}",
  "heatWatch.heiferNotServedAbout":
    "Heifer, about {age, plural, one {# month} other {# months}} old, not yet served — due by {due, plural, one {# month} other {# months}} · {pen}",
  "heatWatch.heiferAgeUnknown": "Heifer, age not known, not yet served · {pen}",
  "refusal.notMissing": "This animal is not missing: nobody is looking for it",
  "refusal.gdNumberNeeded": "A theft needs the thana's GD number",
  "refusal.noFloatOnTheTrip": "No float was handed out for this trip",
  "refusal.wageTookDraws":
    "This wage took the person's draws, so its amount, person and month stay as they were",
  "refusal.drawAlreadyTaken":
    "A payday has already taken this much of the draw; it cannot go below that, or move to another person",
  "wageDraw.tab": "Wage draws",
  "wageDraw.record": "Record a draw",
  "wageDraw.hint":
    "Money a person takes ahead of payday. It counts as wages the day it goes, and comes off their next wage.",
  "wageDraw.day": "Day drawn",
  "wageDraw.recorded": "Draw recorded",
  "wageDraw.none": "Nobody owes a draw",
  "wageDraw.col.owed": "Still owed",
  "wageDraw.col.draws": "Draws",
  "wageDraw.col.oldest": "Oldest draw",
  "wageDraw.owing": "Draws still owed",
  "wageDraw.listHint":
    "What each person has drawn ahead and still owes. Their next wage takes it off, the oldest first.",
  "wageDraw.atPayday":
    "Owes {owed} in draws: this wage takes off {taken}, and {paid} is paid now.",
  "wageDraw.carried": "The next wage takes off the other {amount}.",
  "wageDraw.correct": "Correct this draw",
  "wageDraw.correctHint":
    "Change what is wrong. A draw that never happened is taken back by putting it to 0. What a payday has already taken off it stays taken. The original stays readable in the audit trail.",
  "refusal.bankNeedsASlip":
    "Cash into or out of the bank needs its slip or check",
  "refusal.holdsNoCash": "Only the owner or a manager holds the farm's cash",
  "refusal.handoverGoesNowhere":
    "Cash is handed from one hand to another, or to or from the bank",
  "cash.tab": "Cash in hand",
  "cash.hint":
    "What each person holds of the farm's cash: the cash money that named their hand, less what they paid out and handed over. Mobile money and the bank name nobody. Open a hand to see what moved.",
  "cash.nobody": "Nobody holds the farm's cash yet",
  "cash.hands": "What each hand holds",
  "cash.col.hand": "Whose hand",
  "cash.col.lastCount": "Last counted",
  "cash.col.ventures": "Ventures' sale cash",
  "cash.col.inHand": "In hand",
  "cash.col.carrier": "Carried by",
  "cash.col.handed": "Handed out",
  "cash.col.bought": "Bought",
  "cash.col.due": "To come back",
  "cash.none": "No cash has moved through this hand yet.",
  "cash.uncountHint":
    "Counted home against the wrong figure: the cash it brought back goes back to the hand that carried it, and the outing is counted afresh.",
  "cash.voidHandover": "Take back",
  "cash.voidHandoverHint":
    "Written twice, or to the wrong hand: the cash is back in the hand it never left. A count of either hand since stands on it.",
  "cash.voidHandoverIt": "Void it: the cash never changed hands",
  "cash.heldBy": "in {name}'s hand",
  "cash.neverCounted": "Not counted yet",
  "cash.forTrip": "A buying trip's float",
  "cash.forTripHint":
    "Cash for one of the farm's own buying trips, counted home against what it buys when the lorry is back.",
  "cash.noTrip": "Not for a trip",
  "cash.floatsOut": "Buying trip floats out",
  "cash.floatLine":
    "Carried by {name}: {handed} out, {bought} bought, {due} to come back",
  "cash.countHome": "Count home",
  "cash.countHomeTitle": "Count the float home · {trip}",
  "cash.countHomeHint":
    "The cash {name} brought back. It must make the float balance to the {currencyOne} against what the trip bought.",
  "cash.cashBack": "Cash brought back ({currencySign})",
  "cash.countedHome": "The float is counted home",
  "cash.lastCount": "Counted {day}: {counted} found, {expected} expected",
  "cash.countShort": "{amount} short",
  "cash.countOver": "{amount} over",
  "cash.handOver": "Hand over",
  "cash.handOverTitle": "Hand over cash · {name}",
  "cash.handOverHint":
    "Cash passed to another person, or into the bank with its slip. Nothing is earned or spent: it only changes hands.",
  "cash.handedOver": "Handed over",
  "cash.heldForVenture": "of which {amount} is {venture}'s — {tags}",
  "cash.deposit": "Deposit into the venture account",
  "cash.depositTitle": "Deposit into {venture}'s account",
  "cash.depositHint":
    "Bank a venture's sale cash taken at the livestock market, with the deposit slip. The venture account holds it only once it is deposited.",
  "cash.depositTotal": "To be deposited: {amount}",
  "cash.depositDay": "Day it went in",
  "cash.deposited": "Deposited into the venture account",
  "cash.to": "To",
  "cash.whoseHand": "Whose hand took the cash",
  "cash.whoseHandPaid": "Whose hand paid the cash",
  "cash.myOwnHand": "My own",
  "cash.bank": "The bank",
  "cash.amount": "Amount ({currencySign})",
  "cash.slip": "Deposit slip or check",
  "cash.note": "Note",
  "cash.handedTo": "Handed to {name}",
  "cash.handedFrom": "From {name}",
  "cash.toBank": "Into the bank",
  "cash.fromBank": "Out of the bank",
  "refusal.weighedNeedsAKiloSlip":
    "Only feed bought by the kilo is weighed against the seller's slip",
  "alerts.feedPriceJump":
    "{feed} bought at {currencySign}{price} per {unit}, {percent}% over the last lot at {currencySign}{previous}",
  "alerts.settingsChanged":
    "{name} changed {count, plural, one {one of the farm's settings} other {# of the farm's settings}}",
  "dose.give": "Dose not prescribed",
  "dose.hint":
    "Medicine given on the pharmacy's advice, or anybody's, before the vet saw her. It holds her milk and meat as any dose does, and the vet is told at once. Bought it just now? Write the purchase on the Drugs page too, so the store adds up.",
  "dose.product": "Medicine",
  "dose.pick": "Choose the medicine",
  "dose.givenAt": "When it was given (empty is now)",
  "dose.advice": "Why, and who advised it",
  "dose.holdsOwn":
    "Holds her milk {milk, plural, one {# day} other {# days}} and her meat {meat, plural, one {# day} other {# days}}.",
  "dose.holdsDefault":
    "The vet has not written this medicine's days, so it takes the vet's default: milk {milk, plural, one {# day} other {# days}}, meat {meat, plural, one {# day} other {# days}}.",
  "dose.askTheVet":
    "The vet has written no days for this medicine, and no default. Ask the vet first.",
  "dose.recorded": "Dose written; the vet will be told",
  "dose.void": "Take it back",
  "dose.voidHint":
    "Written against the wrong animal, or twice: her holds are worked out again without it. Write it again against the animal really given it.",
  "dose.voidIt": "Void it: she was not given this",
  "drugs.defaultDays": "Default withdrawal days",
  "drugs.defaultDaysHint":
    "For a dose given without a prescription, of a medicine with no days written yet. A dose already given keeps the days it took.",
  "drugs.defaultNone":
    "Not written yet: such a dose is refused until you write them.",
  "drugs.defaultSaved": "Default days saved",
  "refusal.askTheVetForDays":
    "The vet has written no withdrawal days for this medicine, nor the farm's default; ask the vet",
  "refusal.diagnosisNotHers": "That diagnosis is another animal's",
  "refusal.medicineCountIncomplete":
    "A medicine count counts every medicine on the list",
  "refusal.givenInTheFuture":
    "A dose cannot be given at a time that has not come yet",
  "refusal.productRetired": "That medicine is retired from the medicine list",
  "alerts.doseNotPrescribed":
    "{tag} was given {product} without a prescription: {advice}. Check her withdrawal",
  "alerts.headCountDiffers":
    "The evening count in {pen} found {counted, plural, one {# animal} other {# animals}}; the register has {expected}",
  "animals.markNotFound": "Mark not found",
  "animals.markNotFoundHint":
    "It is not in its pen. It stays in the herd while the farm looks for it, and you and the owner are told at once.",
  "animals.markedNotFound": "{tag} marked not found",
  "animals.writeOff": "Write off as lost",
  "animals.writeOffHint":
    "It leaves the herd as lost from the morning the round last looked for it: off the pen boards, the rounds and the head counts. Everything recorded about it stays, and it comes back if it is found.",
  "animals.writeOffCause": "What became of it",
  "animals.writeOffStolen": "Stolen",
  "animals.writeOffGd": "Thana GD number",
  "animals.writeOffDone": "{tag} written off as lost",
  "animals.writeOffVentureHint":
    "It leaves the herd as lost from the morning the round last looked for it. It is {venture}'s, so the farm makes it good: what it has cost the venture to date goes from the farm into the venture account by bank, and its investors lose nothing.",
  "animals.madeGoodReference": "The transfer's reference",
  "animals.madeGoodAmount":
    "Transfer {amount} into the venture's account: what she has cost it so far",
  "animals.madeGoodReferenceHint":
    "The bank transfer from the farm into the venture account that pays for it.",
  "animals.writeOffAsk":
    "Missing {days, plural, one {# day} other {# days}} — write it off as lost?",
  "animals.writtenOff": "Written off as lost on {day}",
  "animals.writtenOffStolen": "Stolen · GD {gd}",
  "animals.foundAfterAll": "Found after all",
  "animals.voidWriteOff": "Wrong tag",
  "animals.voidWriteOffHint":
    "Written off against the wrong tag: she was never lost. She comes back as she was; a venture's animal stays the venture's, and the money she was made good with comes back to the farm.",
  "animals.voidWriteOffIt": "Take the write-off back: she was never lost",
  "owner.lostYear":
    "Lost in 12 months: {count, plural, one {# animal} other {# animals}} · {amount} of what they cost",
} as const;
