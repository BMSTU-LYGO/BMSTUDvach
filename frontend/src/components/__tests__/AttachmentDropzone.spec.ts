import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AttachmentDropzone from '../form/AttachmentDropzone.vue'

describe('AttachmentDropzone', () => {
  it('renders dropzone with correct text', () => {
    const wrapper = mount(AttachmentDropzone, {
      props: {
        files: [],
      },
    })

    expect(wrapper.text()).toContain('Перетащите файлы сюда')
    expect(wrapper.text()).toContain('или нажмите для выбора')
  })

  it('emits update:files when files are selected', async () => {
    const wrapper = mount(AttachmentDropzone, {
      props: {
        files: [],
      },
    })

    const file = new File(['test'], 'test.txt', { type: 'text/plain' })
    const input = wrapper.find('input[type="file"]')
    
    // Mock file selection
    Object.defineProperty(input.element, 'files', {
      value: [file],
      writable: false,
    })

    await input.trigger('change')

    expect(wrapper.emitted('update:files')).toBeTruthy()
    expect(wrapper.emitted('update:files')![0][0]).toHaveLength(1)
  })

  it('validates file size', async () => {
    const wrapper = mount(AttachmentDropzone, {
      props: {
        files: [],
        maxSize: 1024, // 1KB
      },
    })

    const largeFile = new File(['x'.repeat(2000)], 'large.txt', { type: 'text/plain' })
    const input = wrapper.find('input[type="file"]')
    
    Object.defineProperty(input.element, 'files', {
      value: [largeFile],
      writable: false,
    })

    await input.trigger('change')

    expect(wrapper.emitted('error')).toBeTruthy()
    expect(wrapper.emitted('error')![0][0]).toContain('слишком большой')
  })

  it('validates file type', async () => {
    const wrapper = mount(AttachmentDropzone, {
      props: {
        files: [],
        accept: 'image/*',
      },
    })

    const invalidFile = new File(['test'], 'test.txt', { type: 'text/plain' })
    const input = wrapper.find('input[type="file"]')
    
    Object.defineProperty(input.element, 'files', {
      value: [invalidFile],
      writable: false,
    })

    await input.trigger('change')

    expect(wrapper.emitted('error')).toBeTruthy()
    expect(wrapper.emitted('error')![0][0]).toContain('неподдерживаемый формат')
  })

  it('limits number of files', async () => {
    const wrapper = mount(AttachmentDropzone, {
      props: {
        files: [],
        maxFiles: 2,
      },
    })

    const file1 = new File(['test1'], 'test1.txt', { type: 'text/plain' })
    const file2 = new File(['test2'], 'test2.txt', { type: 'text/plain' })
    const file3 = new File(['test3'], 'test3.txt', { type: 'text/plain' })
    
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [file1, file2, file3],
      writable: false,
    })

    await input.trigger('change')

    const emittedFiles = wrapper.emitted('update:files')![0][0]
    expect(emittedFiles).toHaveLength(2) // Should be limited to maxFiles
  })

  it('removes files', async () => {
    const file1 = new File(['test1'], 'test1.txt', { type: 'text/plain' })
    const file2 = new File(['test2'], 'test2.txt', { type: 'text/plain' })
    
    const wrapper = mount(AttachmentDropzone, {
      props: {
        files: [file1, file2],
      },
    })

    const removeButtons = wrapper.findAll('.attachment-dropzone__item-remove')
    if (removeButtons.length > 0) {
      await removeButtons[0].trigger('click')
      expect(wrapper.emitted('update:files')).toBeTruthy()
      expect(wrapper.emitted('update:files')![0][0]).toHaveLength(1)
    }
  })

  it('handles drag and drop', async () => {
    const wrapper = mount(AttachmentDropzone, {
      props: {
        files: [],
      },
    })

    const file = new File(['test'], 'test.txt', { type: 'text/plain' })
    const dropzone = wrapper.find('.attachment-dropzone')

    // Simulate dragenter
    await dropzone.trigger('dragenter', {
      dataTransfer: {
        files: [file],
      },
    })

    // Simulate drop
    await dropzone.trigger('drop', {
      dataTransfer: {
        files: [file],
      },
    })

    expect(wrapper.emitted('update:files')).toBeTruthy()
  })

  it('handles paste from clipboard', async () => {
    const wrapper = mount(AttachmentDropzone, {
      props: {
        files: [],
      },
    })

    const file = new File(['test'], 'pasted.png', { type: 'image/png' })
    const dropzone = wrapper.find('.attachment-dropzone')

    // Simulate paste
    await dropzone.trigger('paste', {
      clipboardData: {
        files: [file],
      },
    })

    expect(wrapper.emitted('update:files')).toBeTruthy()
  })

  it('shows disabled state when max files reached', () => {
    const files = Array(4).fill(null).map((_, i) => 
      new File([`test${i}`], `test${i}.txt`, { type: 'text/plain' })
    )
    
    const wrapper = mount(AttachmentDropzone, {
      props: {
        files,
        maxFiles: 4,
      },
    })

    expect(wrapper.text()).toContain('Достигнут лимит')
    expect(wrapper.find('.attachment-dropzone--disabled').exists()).toBe(true)
  })
})
