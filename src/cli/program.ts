import { Command } from 'commander'

import { registerInitCommand, type InitCommandDeps } from './commands/init.js'

export type CreateProgramOptions = {
  initCommandDeps?: InitCommandDeps
}

export function createProgram(options: CreateProgramOptions = {}) {
  const program = new Command()

  program.name('autoqa').description('AutoQA Agent CLI')

  registerInitCommand(program, options.initCommandDeps)

  return program
}
