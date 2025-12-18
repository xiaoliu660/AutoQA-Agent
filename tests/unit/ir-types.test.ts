import { describe, it, expect } from 'vitest'

import { isElementTargetingTool, ELEMENT_TARGETING_TOOLS } from '../../src/ir/types.js'

describe('IR Types', () => {
  describe('ELEMENT_TARGETING_TOOLS', () => {
    it('should include click, fill, and select_option', () => {
      expect(ELEMENT_TARGETING_TOOLS.has('click')).toBe(true)
      expect(ELEMENT_TARGETING_TOOLS.has('fill')).toBe(true)
      expect(ELEMENT_TARGETING_TOOLS.has('select_option')).toBe(true)
      expect(ELEMENT_TARGETING_TOOLS.has('assertElementVisible')).toBe(true)
    })

    it('should not include non-element-targeting tools', () => {
      expect(ELEMENT_TARGETING_TOOLS.has('navigate')).toBe(false)
      expect(ELEMENT_TARGETING_TOOLS.has('scroll')).toBe(false)
      expect(ELEMENT_TARGETING_TOOLS.has('wait')).toBe(false)
      expect(ELEMENT_TARGETING_TOOLS.has('assertTextPresent')).toBe(false)
    })
  })

  describe('isElementTargetingTool', () => {
    it('should return true for element-targeting tools', () => {
      expect(isElementTargetingTool('click')).toBe(true)
      expect(isElementTargetingTool('fill')).toBe(true)
      expect(isElementTargetingTool('select_option')).toBe(true)
      expect(isElementTargetingTool('assertElementVisible')).toBe(true)
    })

    it('should return false for non-element-targeting tools', () => {
      expect(isElementTargetingTool('navigate')).toBe(false)
      expect(isElementTargetingTool('scroll')).toBe(false)
      expect(isElementTargetingTool('wait')).toBe(false)
      expect(isElementTargetingTool('snapshot')).toBe(false)
    })
  })
})
