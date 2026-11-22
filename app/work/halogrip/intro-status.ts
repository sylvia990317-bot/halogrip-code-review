/** Failure stays terminal until reload; a media change may restart a static intro. */
export type IntroStatus = "checking" | "static" | "loading" | "ready" | "failed";
export type IntroEvent = "enable" | "disable" | "ready" | "fail";

export function transitionIntro(status: IntroStatus, event: IntroEvent): IntroStatus {
  if (status === "failed") return status;
  switch (event) {
    case "enable": return status === "ready" ? "ready" : "loading";
    case "disable": return "static";
    case "ready": return status === "loading" ? "ready" : status;
    case "fail": return status === "loading" || status === "ready" ? "failed" : status;
  }
}
