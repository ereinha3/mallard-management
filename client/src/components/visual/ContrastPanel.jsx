export default function ContrastPanel({
  as: Component = 'div',
  children,
  className = '',
  style,
  ...props
}) {
  return (
    <Component
      className={`contrast-panel ${className}`.trim()}
      style={style}
      {...props}
    >
      {children}
    </Component>
  )
}
