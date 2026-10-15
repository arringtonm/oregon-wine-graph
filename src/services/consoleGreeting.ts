// A hello for anyone who opens the browser's console: who made the site, and how to reach
// them. The email address is put together here as it's printed, and written out
// ("michael [at] maple [dot] casa"), so it never appears whole in the page or its code
export function consoleGreeting(version: string): string {
  const email = ['michael', '[at]', 'maple', '[dot]', 'casa'].join(' ')
  return `🥂 Oregon Wine Graph ${version}\nMade by Michael Arrington · https://www.arrington.tech\nSay hello: ${email}`
}

export function greetConsole() {
  console.log(consoleGreeting(__SITE_VERSION__))
}
