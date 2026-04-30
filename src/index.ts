import { Context, Schema } from 'koishi'
import { join } from 'path'
import { promises as fs } from 'fs'
import * as yaml from 'js-yaml'

export const name = 'tips'

export interface Config {
  dataFolder: string
  enableQQNativeMarkdown: boolean
  enableQQInlineCmd: boolean
}

export const Config: Schema<Config> = Schema.object({
  dataFolder: Schema.string().default('tips').description('存放 tips 的 yaml 文件所在的 data 目录下的文件夹名'),
  enableQQNativeMarkdown: Schema.boolean().default(true).description('是否在 QQ 官方机器人下发送 Markdown 和按钮'),
  enableQQInlineCmd: Schema.boolean().default(true).description('在使用 Markdown 时启用“再来一个”快捷按钮'),
})

export function apply(ctx: Context, config: Config) {
  let tipsList: string[] = []

  ctx.on('ready', async () => {
    try {
      const folderPath = join(ctx.baseDir, 'data', config.dataFolder)
      await fs.mkdir(folderPath, { recursive: true }).catch(() => {})
      let files = await fs.readdir(folderPath)
      
      let yamlFiles = files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))

      if (yamlFiles.length === 0) {
        const exampleContent = `- 这是一个自动生成的提示示例。可以在这里添加更多内容！
- Koishi 是一个用于构建跨平台聊天机器人的优秀框架。
- 每个减号开头的就是一条独立的提示哦~
`
        await fs.writeFile(join(folderPath, 'example.yml'), exampleContent, 'utf8')
        yamlFiles.push('example.yml')
        ctx.logger('tips').info(`未检测到 yml 文件，已自动在 ${config.dataFolder} 创建 example.yml 模板`)
      }
      
      for (const file of yamlFiles) {
        const content = await fs.readFile(join(folderPath, file), 'utf8')
        const parsed = yaml.load(content)
        
        if (Array.isArray(parsed)) {
          tipsList.push(...parsed.filter(item => typeof item === 'string'))
        } else if (parsed && typeof parsed === 'object') {
          Object.values(parsed).forEach(val => {
            if (Array.isArray(val)) {
              tipsList.push(...val.filter(item => typeof item === 'string'))
            }
          })
        }
      }
      ctx.logger('tips').info(`Loaded ${tipsList.length} tips from ${config.dataFolder}`)
    } catch (e) {
      ctx.logger('tips').error('Failed to load tips:', e)
    }
  })

  ctx.command('tips', '获取一条“你知道吗？”提示')
    .example('tips')
    .alias('你知道吗')
    .action(async ({ session }) => {
      if (tipsList.length === 0) {
        return '目前还没有任何提示，请在 data 目录下的 yml 文件中添加。'
      }

      const tip = tipsList[Math.floor(Math.random() * tipsList.length)]
      const tipText = `你知道吗：${tip}`

      if (session.platform === 'qq' && config.enableQQNativeMarkdown) {
        let buttons = []
        if (config.enableQQInlineCmd) {
          buttons = [
            {
              id: '1',
              render_data: { label: '再来一个', visited_label: '再来一个', style: 1 },
              action: { type: 2, permission: { type: 2 }, data: '/tips', reply: false, enter: true }
            }
          ]
        }

        session['seq'] = session['seq'] || 0
        const payload: any = {
          msg_type: 2 as const,
          msg_id: session.messageId,
          msg_seq: ++session['seq'],
          content: '你知道吗',
          markdown: { content: tipText },
          keyboard: buttons.length ? {
            content: {
              rows: [ { buttons } ]
            }
          } : undefined
        }
        
        try {
          if (session.isDirect) {
            // @ts-ignore
            await session.qq?.sendPrivateMessage(session.channelId, payload)
          } else {
            // @ts-ignore
            await session.qq?.sendMessage(session.channelId, payload)
          }
          return
        } catch (e: any) {
          ctx.logger('tips').warn('Failed to send QQ Markdown interact buttons:', e.response?.data || e.message || e)
          // Fallback
          return tipText
        }
      } else {
        return tipText
      }
    })
}
