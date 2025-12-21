import { describe, it, expect } from 'vitest'
import { Command } from 'commander'
import { registerPlanCommand } from '../../src/cli/commands/plan.js'

describe('cli/commands/plan', () => {
  describe('registerPlanCommand', () => {
    it('should register plan command', () => {
      const program = new Command()
      registerPlanCommand(program)

      const planCommand = program.commands.find((cmd) => cmd.name() === 'plan')
      expect(planCommand).toBeDefined()
      expect(planCommand?.description()).toBe('Run full test planning: exploration + test case generation')
    })

    it('should register plan-explore command', () => {
      const program = new Command()
      registerPlanCommand(program)

      const exploreCommand = program.commands.find((cmd) => cmd.name() === 'plan-explore')

      expect(exploreCommand).toBeDefined()
      expect(exploreCommand?.description()).toBe('Explore a web application and generate page structure (exploration only)')
    })

    it('should have required url option on plan-explore', () => {
      const program = new Command()
      registerPlanCommand(program)

      const exploreCommand = program.commands.find((cmd) => cmd.name() === 'plan-explore')

      const urlOption = exploreCommand?.options.find((opt) => opt.long === '--url')
      expect(urlOption).toBeDefined()
      expect(urlOption?.required).toBe(true)
    })

    it('should have optional depth option on plan-explore', () => {
      const program = new Command()
      registerPlanCommand(program)

      const exploreCommand = program.commands.find((cmd) => cmd.name() === 'plan-explore')

      const depthOption = exploreCommand?.options.find((opt) => opt.long === '--depth')
      expect(depthOption).toBeDefined()
    })

    it('should have login-related options on plan-explore', () => {
      const program = new Command()
      registerPlanCommand(program)

      const exploreCommand = program.commands.find((cmd) => cmd.name() === 'plan-explore')

      const loginUrlOption = exploreCommand?.options.find((opt) => opt.long === '--login-url')
      const usernameOption = exploreCommand?.options.find((opt) => opt.long === '--username')
      const passwordOption = exploreCommand?.options.find((opt) => opt.long === '--password')

      expect(loginUrlOption).toBeDefined()
      expect(usernameOption).toBeDefined()
      expect(passwordOption).toBeDefined()
    })

    it('should have headless option on plan-explore', () => {
      const program = new Command()
      registerPlanCommand(program)

      const exploreCommand = program.commands.find((cmd) => cmd.name() === 'plan-explore')

      const headlessOption = exploreCommand?.options.find((opt) => opt.long === '--headless')
      expect(headlessOption).toBeDefined()
    })

    it('should have guardrail options on plan-explore', () => {
      const program = new Command()
      registerPlanCommand(program)

      const exploreCommand = program.commands.find((cmd) => cmd.name() === 'plan-explore')

      const maxPagesOption = exploreCommand?.options.find((opt) => opt.long === '--max-pages')
      const maxAgentTurnsOption = exploreCommand?.options.find((opt) => opt.long === '--max-agent-turns')
      const maxSnapshotsOption = exploreCommand?.options.find((opt) => opt.long === '--max-snapshots')

      expect(maxPagesOption).toBeDefined()
      expect(maxAgentTurnsOption).toBeDefined()
      expect(maxSnapshotsOption).toBeDefined()
    })

    it('should register plan-generate command', () => {
      const program = new Command()
      registerPlanCommand(program)

      const generateCommand = program.commands.find((cmd) => cmd.name() === 'plan-generate')

      expect(generateCommand).toBeDefined()
      expect(generateCommand?.description()).toBe('Generate test plan and Markdown specs from exploration artifacts')
    })

    it('should have required run-id option on plan-generate', () => {
      const program = new Command()
      registerPlanCommand(program)

      const generateCommand = program.commands.find((cmd) => cmd.name() === 'plan-generate')

      const runIdOption = generateCommand?.options.find((opt) => opt.long === '--run-id')

      expect(runIdOption).toBeDefined()
      expect(runIdOption?.required).toBe(true)
    })
  })
})
