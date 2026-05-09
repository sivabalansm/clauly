declare module "shelljs" {
  interface ShellConfig {
    execPath: string | null
    silent: boolean
    fatal: boolean
    verbose: boolean
  }
  interface Shell {
    config: ShellConfig
  }
  const shell: Shell
  export default shell
}
