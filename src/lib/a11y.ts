/** Accessibility settings for this site, remembered in this browser (see AccessibilityMenu). */
export const A11Y_KEY = "appmaker.a11y";

/** Runs before the page paints (in the root layout), so there's no flash of the wrong settings. */
export const A11Y_BOOT = `try{var s=JSON.parse(localStorage.getItem("${A11Y_KEY}")||"{}"),c=document.documentElement.classList;if(s.text==="large")c.add("a11y-text-lg");if(s.text==="larger")c.add("a11y-text-xl");if(s.contrast)c.add("a11y-contrast");if(s.motion)c.add("a11y-motion");if(s.links)c.add("a11y-links");if(s.spacing)c.add("a11y-spacing")}catch(e){}`;
