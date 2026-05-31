export default function PageTransition({ children, className = '', style, pageKey }) {
  return (
    <div
      className={`page-transition ${className}`.trim()}
      data-page={pageKey}
      style={style}
    >
      {children}
    </div>
  )
}
