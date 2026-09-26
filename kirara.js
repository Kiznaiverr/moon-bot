import { Kirara } from "@kiznavierr/kirara";

const kirara = new Kirara("genshin"); // or "hsr" or "zzz"

// Get player summary
kirara
  .getPlayerSummary("618285856", { lang: "en" })
  .then((data) => console.log(data));