import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { basename, extname, join } from 'path';
import { materialsDir, safeSegment } from '../common/paths';
import { PrismaService } from '../prisma/prisma.service';

const SUPPORTED = ['.docx', '.pdf', '.md', '.txt'];

@Injectable()
export class MaterialsService {
  private readonly parserUrl = process.env.PARSER_URL || 'http://parser:8000';

  constructor(private readonly prisma: PrismaService) {}

  private async assertEnterprise(enterpriseId: string) {
    const enterprise = await this.prisma.enterprise.findUnique({ where: { enterpriseId } });
    if (!enterprise) {
      throw new NotFoundException('企业不存在');
    }
    return enterprise;
  }

  /** 交由独立的 Python 解析服务抽取纯文本（docx 走 OOXML、pdf 走 pypdf）。 */
  async parseToText(buffer: Buffer, filename: string): Promise<string> {
    const ext = extname(filename).toLowerCase();
    if (!SUPPORTED.includes(ext)) {
      throw new BadRequestException(`不支持的文件类型：${ext || '(无扩展名)'}，仅支持 ${SUPPORTED.join(' / ')}`);
    }
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)]), basename(filename));
    let res: Response;
    try {
      res = await fetch(`${this.parserUrl}/parse`, { method: 'POST', body: form });
    } catch (err) {
      throw new BadGatewayException(`解析服务不可达：${(err as Error).message}`);
    }
    if (!res.ok) {
      const detail = await res.text();
      throw new BadGatewayException(`解析服务失败 HTTP ${res.status}：${detail.slice(0, 200)}`);
    }
    const data: any = await res.json();
    return String(data.text ?? '');
  }

  /** 上传并解析：原文件与解析结果均落入 data/资料/，与两份记忆文档互不混淆。 */
  async upload(enterpriseId: string, originalName: string, buffer: Buffer) {
    await this.assertEnterprise(enterpriseId);
    if (!buffer?.length) {
      throw new BadRequestException('文件为空');
    }
    const text = await this.parseToText(buffer, originalName);

    const dir = materialsDir(enterpriseId);
    await fs.mkdir(dir, { recursive: true });

    const rawName = basename(originalName);
    const safeRaw = rawName.replace(/[\\/]/g, '_');
    await fs.writeFile(join(dir, safeRaw), buffer); // 保留原件

    const base = rawName.replace(extname(rawName), '');
    const parsedName = `${safeSegment(base.replace(/[\\/]/g, '_'))}.md`;
    const header =
      `# 资料：${rawName}\n\n> 来源文件：${safeRaw}｜解析时间：${new Date().toISOString()}｜解析器：${extname(rawName).toLowerCase() || 'text'}\n\n`;
    await fs.writeFile(join(dir, parsedName), header + text, 'utf8');

    return {
      enterprise_id: enterpriseId,
      original_name: rawName,
      parsed_file: parsedName,
      path: `data/资料/${parsedName}`,
      chars: text.length,
    };
  }

  async list(enterpriseId: string) {
    await this.assertEnterprise(enterpriseId);
    const dir = materialsDir(enterpriseId);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files: Array<{ name: string; bytes: number; updated_at: string }> = [];
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.md')) {
          continue;
        }
        const stat = await fs.stat(join(dir, e.name));
        files.push({ name: e.name, bytes: stat.size, updated_at: stat.mtime.toISOString() });
      }
      return { enterprise_id: enterpriseId, materials: files };
    } catch {
      return { enterprise_id: enterpriseId, materials: [] };
    }
  }

  async read(enterpriseId: string, file: string) {
    await this.assertEnterprise(enterpriseId);
    const safe = safeSegment(file);
    const target = join(materialsDir(enterpriseId), safe);
    try {
      return { enterprise_id: enterpriseId, name: safe, content: await fs.readFile(target, 'utf8') };
    } catch {
      throw new NotFoundException('资料不存在');
    }
  }
}
