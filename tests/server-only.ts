/** `server-only` throws on import outside a server bundle, which is exactly what
 *  it is for — and which would make every module that guards itself with it
 *  untestable. The guard belongs in the application; here it is replaced by
 *  nothing, so the pure functions inside those modules can be tested directly
 *  rather than through a copy of themselves. */
export {};
