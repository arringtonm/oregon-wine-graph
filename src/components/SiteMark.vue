<!-- The site's mark for the header: the tab icon's Oregon and glass (public/favicon.svg)
     without its dark tile, drawn in the theme's colours so it reads on light and dark -->
<template>
  <svg class="mark" viewBox="4 6 56 52" aria-hidden="true">
    <defs>
      <linearGradient id="mark-wine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#c03a60" />
        <stop offset="1" stop-color="#651430" />
      </linearGradient>
    </defs>
    <path class="mark__oregon" d="M8.5 13.3 L10.7 13.2 L12.7 14.1 L14.3 14.0 L15.9 14.8 L16.7 16.5 L16.9 18.8 L18.9 19.6 L20.7 19.8 L22.6 19.0 L25.3 18.3 L27.5 19.3 L29.3 18.9 L31.2 18.0 L34.0 18.2 L36.7 17.1 L39.4 16.5 L42.1 15.7 L55.9 15.7 L56.9 17.1 L58.4 18.4 L59.0 19.7 L57.5 22.5 L56.4 25.0 L55.3 27.3 L54.3 29.8 L53.9 31.5 L55.2 32.1 L56.1 34.4 L55.2 35.9 L55.2 52.8 L7.3 52.8 L6.3 50.0 L5.9 46.7 L5.0 45.0 L5.5 43.1 L6.1 40.6 L7.1 37.3 L7.9 33.8 L8.2 30.3 L8.5 26.7 L8.9 22.7 L9.0 18.9 L9.2 15.7 L8.5 13.3Z" />
    <path d="M18.6 22h26.8c-.9 8.6-5.4 15-13.4 15.6-8-.6-12.5-7-13.4-15.6z" fill="url(#mark-wine)" />
    <ellipse cx="32" cy="22" rx="13.4" ry="1.7" fill="#de7b97" />
    <path class="mark__glass" d="M18.5 9.5h27c1.6 13.2-3.9 27.6-13.5 28.6-9.6-1-15.1-15.4-13.5-28.6z" />
    <path class="mark__stem" d="M32 38.1v12.4" />
    <ellipse class="mark__foot" cx="32" cy="52" rx="9.5" ry="2.4" />
  </svg>
</template>

<style scoped>
.mark {
  flex: none;
  width: 30px;
  height: 28px;
}

/* A soft burgundy tint of the state, in either theme */
.mark__oregon {
  fill: color-mix(in srgb, var(--accent) 24%, transparent);
  stroke: color-mix(in srgb, var(--accent) 40%, transparent);
  stroke-width: 0.8;
  stroke-linejoin: round;
}

/* The glass in the text colour: dark on the light theme, cream on the dark */
.mark__glass,
.mark__stem {
  fill: none;
  stroke: var(--text-primary);
  stroke-linecap: round;
  stroke-linejoin: round;
}

.mark__glass {
  stroke-width: 2.6;
}

.mark__stem {
  stroke-width: 2.8;
}

.mark__foot {
  fill: var(--text-primary);
}
</style>
