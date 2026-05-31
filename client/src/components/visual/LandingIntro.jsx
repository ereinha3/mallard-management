const INTRO_CONTOURS = [
  'M126 102C168 68 226 65 269 97C314 131 327 191 300 239C274 286 216 305 167 281C120 258 98 205 111 156C116 135 120 118 126 102Z',
  'M153 130C184 106 224 103 255 127C287 152 296 193 276 226C256 260 216 273 181 257C148 242 132 205 140 169C144 153 148 140 153 130Z',
  'M179 157C197 142 224 139 243 154C264 170 270 198 257 220C244 243 216 251 192 240C170 230 160 205 166 181C169 171 173 163 179 157Z',
  'M302 218C341 184 399 181 443 213C486 244 499 303 472 349C446 394 392 414 343 392C298 372 275 323 285 273C290 248 294 230 302 218Z',
  'M331 247C359 223 398 221 429 244C460 267 469 308 450 341C431 374 392 388 358 373C326 359 310 323 317 287C321 269 325 256 331 247Z',
  'M360 275C378 262 401 261 420 275C438 289 444 313 432 333C420 353 397 361 376 352C356 344 346 322 350 300C353 289 356 281 360 275Z',
]

export default function LandingIntro({ className = '' }) {
  return (
    <div className={`landing-intro ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 560 520" role="presentation" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="intro-ridge" x1="18%" y1="0%" x2="85%" y2="100%">
            <stop offset="0%" stopColor="var(--green-bright)" />
            <stop offset="54%" stopColor="var(--gold-light)" />
            <stop offset="100%" stopColor="var(--green)" />
          </linearGradient>
        </defs>
        <path
          className="landing-intro__outline"
          d="M88 70L462 70C481 70 493 84 489 103L480 153C475 184 493 213 481 245C467 281 486 316 471 354C457 392 473 431 449 461L173 443C143 441 123 424 118 394C101 288 94 181 88 70Z"
          pathLength="1"
        />
        <path
          className="landing-intro__valley"
          d="M187 82C211 164 205 238 179 313C154 384 160 425 186 444"
          pathLength="1"
        />
        <path
          className="landing-intro__ridge"
          d="M356 78C327 146 330 207 365 270C398 328 391 383 351 444"
          pathLength="1"
        />
        <g className="landing-intro__contours">
          {INTRO_CONTOURS.map((line, index) => (
            <path
              key={line}
              d={line}
              pathLength="1"
              style={{ animationDelay: `${index * 120}ms` }}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
