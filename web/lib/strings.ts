/**
 * All user-facing Afaan Oromoo copy lives here.
 * Edit this file when a native speaker reviews wording.
 *
 * Product name: Dubbii ("speech / talk" in Afaan Oromoo)
 */
export const strings = {
  appName: "Dubbii",
  appTagline: "Haasaa Afaan Oromootiin",

  newChat: "Haaraa jalqabi",
  openMenu: "Menu bani",
  closeMenu: "Menu cufi",
  pastChats: "Haasaa darban",
  noPastChats: "Haasaa darban hin jiru.",
  renameChat: "Maqaa jijjiiri",
  deleteChat: "Balleessi",
  renamePrompt: "Maqaa haaraa barreessi",
  renameSave: "Olkaa'i",
  renameCancel: "Dhiisi",
  deleteConfirm: "Haasaa kana balleessuu barbaaddaa?",
  untitledChat: "Haasaa haaraa",

  theme: "Teemaa",
  themeLight: "Ifaa",
  themeDark: "Dukkana",
  themeSystem: "Sirna",

  emptyState: "Gaaffii kee barreessi, ykn faayila asitti harkisi / fe'i.",
  emptyStateTitle: "Haasaa jalqabi",
  composerHint:
    "Faayila asitti harkisi, ykn \"Maxxansi\" tuqi (PDF, suuraa, txt, docx — hangamuu 20 MB)",
  attach: "Maxxansi",
  removeFile: "Haqi",
  placeholder: "Ergaa kee barreessi...",
  send: "Ergi",
  loading: "Eegi...",
  download: "Buufadhu",
  downloadImage: "Suuraa buufadhu",
  downloadConversation: "Haasaa hunda buufadhu",

  quickSummarize: "Cuunfaa kenni",
  quickPlan: "Karoora qopheessi",
  quickReport: "Gabaasa barreessi",

  exportWord: "Word",
  exportPdf: "PDF",
  exportMarkdown: "Markdown",
  exportText: "Text",

  you: "Ani",
  assistant: "Dubbii",

  errorGeneric: "Dogoggorri uumame. Mee irra deebi'ii yaali.",
  errorEmptyReply: "Deebiin duwwaa dhufe. Mee irra deebi'ii yaali.",
  errorServerDown:
    "Serveeri hin hojjenne. Mee akka port 8000 irratti deemaa jiru mirkaneessi.",
  errorResetFailed: "Haasa'uu haaromsuun hin milkoofne. Mee irra deebi'ii yaali.",
  errorNeedFileFirst: "Dura faayila filadhu, sana booda button kana tuqi.",
  errorNeedMessages: "Haasaa buufachuuf dura ergaa tokko ergi.",
  errorExportFailed: "Buufachuun hin milkoofne.",
  errorPptx:
    "Faayilli PowerPoint (.pptx) amma hin deeggaramu. Mee PDF taasisuun ergi.",
  errorFileTooLarge: (name: string) =>
    `Faayilli '${name}' guddaadha. Hangamuu 20 MB qofa fudhatama.`,
  errorFileType:
    "Gosti faayilaa hin deeggaramu. PDF, suuraa, .txt, ykn .docx qofa ergi.",
  defaultFilePrompt: "Faayiloota kana naaf ibsi.",
  imageOnlyPlaceholder: "Suuraa qofa.",

  sessionOk: "Session gaarii dha",
  sessionReconnecting: "Session deebi'aa jira",
  sessionExpired: "Session xumurame",
  sessionUnknown: "Haala session hin beekamu",
  sessionExpiredTitle: "Cookies haaromsi",
  sessionExpiredBody:
    "Session kee xumurame. Cookies haaraa browser irraa fudhuutii asitti galchi.",
  sessionExpiredHelp:
    "gemini.google.com irratti seentii F12 → Network → page haaromsi → request tokko filadhu → Cookie keessaa __Secure-1PSID (PSID) fi __Secure-1PSIDTS (PSIDTS) copy godhi. Gatiin cookie asitti hin ol'aane / hin mul'atu.",
  sessionPsidLabel: "PSID",
  sessionPsidtsLabel: "PSIDTS",
  sessionRefresh: "Haaromsi",
  sessionRefreshing: "Haaromsuu...",
  sessionRefreshOk: "Session haaromfame.",
  sessionRefreshFailed: "Haaromsuun hin milkoofne. Mee qabxii sirrii ta'an yaali.",
} as const;

export type Strings = typeof strings;
