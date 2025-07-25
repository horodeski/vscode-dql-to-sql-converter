function parseExpr(expr: string): string {
  let result = expr;

  // Remove $qb->expr()
  result = result.replace(/\$qb->expr\(\)->/g, '');

  // eq('a', ':b') => a = :b
  result = result.replace(/eq\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g, "$1 = $2");

  // lt('a', ':b') => a < :b
  result = result.replace(/lt\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g, "$1 < $2");

  // gt('a', ':b') => a > :b
  result = result.replace(/gt\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g, "$1 > $2");

  // lte('a', ':b') => a <= :b
  result = result.replace(/lte\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g, "$1 <= $2");

  // gte('a', ':b') => a >= :b
  result = result.replace(/gte\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g, "$1 >= $2");

  // in('a', :list) => a IN (:list)
  result = result.replace(/in\(\s*'([^']+)'\s*,\s*([^)]*)\)/g, "$1 IN ($2)");

  // Trata andX/orX com divisão respeitando parênteses
  const parseX = (inner: string, separator: string) => {
    const parts: string[] = [];
    let current = '';
    let parenLevel = 0;

    for (let i = 0; i < inner.length; i++) {
      const char = inner[i];
      if (char === '(') parenLevel++;
      if (char === ')') parenLevel--;
      if (char === ',' && parenLevel === 0) {
        if (current.trim()) parts.push(parseExpr(current.trim()));
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) parts.push(parseExpr(current.trim()));
    return '(' + parts.join(` ${separator} `) + ')';
  };

  result = result.replace(/andX\(([\s\S]+?)\)/g, (_, inner) => parseX(inner, 'AND'));
  result = result.replace(/orX\(([\s\S]+?)\)/g, (_, inner) => parseX(inner, 'OR'));

  // Remove aspas ao redor de expressões completas
  result = result.replace(/^'(.*)'$/, "$1");


  return result.trim();
}

function splitSelectArguments(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  let parenLevel = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const prev = input[i - 1];

    if ((char === "'" || char === '"') && prev !== '\\') {
      if (inQuotes && char === quoteChar) {
        inQuotes = false;
      } else if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      }
      current += char;
    } else if (!inQuotes && char === '(') {
      parenLevel++;
      current += char;
    } else if (!inQuotes && char === ')') {
      parenLevel--;
      current += char;
    } else if (!inQuotes && parenLevel === 0 && char === ',') {
      args.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

// Junta chamadas multi-linha como ->select('a', 'b', ... ) ou joins
function joinMultilineCalls(lines: string[]): string[] {
  const result = [];
  let buffer = '';
  let openParens = 0;

  const isStartCall = (line: string) =>
    line.startsWith('->select') ||
    line.startsWith('->where') ||
    line.startsWith('->andWhere') ||
    line.startsWith('->orWhere') ||
    line.startsWith('->groupBy') ||
    line.startsWith('->having') ||
    line.startsWith('->andHaving') ||
    line.startsWith('->orHaving') ||
    line.startsWith('->leftJoin') ||
    line.startsWith('->innerJoin') ||
    line.startsWith('->rightJoin');

  for (const line of lines) {
    if (buffer.length > 0) {
      buffer += ' ' + line;
      openParens += (line.match(/\(/g) || []).length;
      openParens -= (line.match(/\)/g) || []).length;

      if (openParens <= 0) {
        result.push(buffer.trim());
        buffer = '';
        openParens = 0;
      }
    } else {
      if (isStartCall(line)) {
        buffer = line;
        openParens = (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;

        if (openParens <= 0) {
          result.push(buffer.trim());
          buffer = '';
          openParens = 0;
        }
      } else {
        result.push(line);
      }
    }
  }

  if (buffer.length > 0) {
    result.push(buffer.trim());
  }

  return result;
}

export function changeOrmToSql(input: string, targetDb: string): string {
  let sql = '';

  const lines = joinMultilineCalls(input.split('\n').map(line => line.trim()));

  const selectLines: string[] = [];
  let fromLine = '';
  const joinLines: string[] = [];
  const whereClauses: string[] = [];
  const groupByClauses: string[] = [];
  const havingClauses: string[] = [];
  const orderByClauses: string[] = [];
  let limitLine = '';
  let offsetLine = '';
  const params: Record<string, string> = {};

  for (const line of lines) {
    // SELECT
    if (line.startsWith('->select')) {
      const content = line.match(/\(([\s\S]+)\)/);
      if (content) {
        const args = splitSelectArguments(content[1]).map(arg => {
          return arg.replace(/^['"]|['"]$/g, '');
        });
        selectLines.length = 0;
        selectLines.push('SELECT ' + args.join(', '));
      }
    }

    // FROM
    if (line.startsWith('->from')) {
      const content = line.match(/\(\s*(?:'([^']+)'|([A-Za-z_\\]+)::class)\s*,\s*['"]([^'"]+)['"]\s*\)/);
      if (content) {
        const table = (content[1] || content[2]).replace('::class', '');
        const alias = content[3];
        fromLine = `FROM ${table} ${alias}`;
      }
    }

    // JOINs (multi-linha agora suportado)
    if (
      line.startsWith('->leftJoin') ||
      line.startsWith('->innerJoin') ||
      line.startsWith('->rightJoin')
    ) {
      const type = line.startsWith('->leftJoin') ? 'LEFT JOIN' :
        line.startsWith('->innerJoin') ? 'INNER JOIN' : 'RIGHT JOIN';

      const content = line.match(
        /\(\s*(?:'([^']+)'|([A-Za-z_\\]+)::class)\s*,\s*'([^']+)'\s*,\s*(?:'WITH'|'ON'|WITH|ON)\s*,\s*'([^']+)'\s*\)/i
      );

      if (content) {
        const table = (content[1] || content[2]).replace('::class', '');
        const alias = content[3];
        const condition = content[4];
        joinLines.push(`${type} ${table} ${alias} ON ${condition}`);
      } else {
        console.warn('JOIN não reconhecido:', line);
      }
    }

    // WHERE / AND / OR WHERE
    if (line.startsWith('->where') || line.startsWith('->andWhere') || line.startsWith('->orWhere')) {
      const content = line.match(/\(([\s\S]+)\)/);
      if (content) {
        const parsed = parseExpr(content[1]);
        if (line.startsWith('->where')) whereClauses.push(parsed);
        else if (line.startsWith('->andWhere')) whereClauses.push('AND ' + parsed);
        else if (line.startsWith('->orWhere')) whereClauses.push('OR ' + parsed);
      }
    }

    // GROUP BY
    if (line.startsWith('->groupBy')) {
      const content = line.match(/\(\s*['"](.+?)['"]\s*\)/);
      if (content) groupByClauses.push(content[1]);
    }

    // HAVING
    if (line.startsWith('->having') || line.startsWith('->andHaving') || line.startsWith('->orHaving')) {
      const content = line.match(/\(\s*['"](.+?)['"]\s*\)/);
      if (content) {
        if (line.startsWith('->having')) havingClauses.push(content[1]);
        else if (line.startsWith('->andHaving')) havingClauses.push('AND ' + content[1]);
        else if (line.startsWith('->orHaving')) havingClauses.push('OR ' + content[1]);
      }
    }

    // ORDER BY
    if (line.startsWith('->orderBy') || line.startsWith('->addOrderBy')) {
      const content = line.match(/\(\s*['"](.+?)['"]\s*,\s*['"](.+?)['"]\s*\)/);
      if (content) orderByClauses.push(`${content[1]} ${content[2].toUpperCase()}`);
    }

    // Params
    if (line.startsWith('->setParameter')) {
      const param = line.match(/\(\s*['"](.+?)['"]\s*,\s*(.+)\s*\)/);
      if (param) params[param[1]] = param[2];
    }

    // LIMIT
    if (line.startsWith('->setMaxResults')) {
      const number = line.match(/\((\d+)\)/);
      if (number) limitLine = `LIMIT ${number[1]}`;
    }

    // OFFSET
    if (line.startsWith('->setFirstResult')) {
      const number = line.match(/\((\d+)\)/);
      if (number) offsetLine = `OFFSET ${number[1]}`;
    }
  }

  // Substituir parâmetros
  const replaceParams = (clause: string) => {
    Object.entries(params).forEach(([key, val]) => {
      val = val.trim().replace(/^\(+|\)+$/g, '');
      val = val.replace(/->value$/, '');

      // Remove aspas externas, se houver
      val = val.replace(/^['"]|['"]$/g, '');

      // Converte booleans para Oracle, se necessário
      const finalVal = targetDb === 'oracle'
        ? (val === 'true' ? '1' : (val === 'false' ? '0' : val))
        : val;

      // Substitui :param por finalVal
      clause = clause.replace(new RegExp(`:${key}\\b`, 'g'), finalVal);
    });

    return clause;
  };

  let whereSql = '';
  if (whereClauses.length) {
    const [first, ...rest] = whereClauses;
    whereSql = 'WHERE ' + first + ' ' + rest.join(' ');
  }

  let havingSql = '';
  if (havingClauses.length) {
    const [first, ...rest] = havingClauses;
    havingSql = 'HAVING ' + first + ' ' + rest.join(' ');
  }

  whereSql = replaceParams(whereSql);
  havingSql = replaceParams(havingSql);

  let limitOffsetSql = '';
  if (limitLine || offsetLine) {
    if (targetDb === 'mysql' || targetDb === 'postgres') {
      limitOffsetSql = [limitLine, offsetLine].filter(Boolean).join(' ');
    } else if (targetDb === 'oracle') {
      const limitNum = limitLine ? limitLine.replace('LIMIT ', '') : '';
      const offsetNum = offsetLine ? offsetLine.replace('OFFSET ', '') : '';

      if (limitNum && offsetNum) {
        limitOffsetSql = `OFFSET ${offsetNum} ROWS FETCH NEXT ${limitNum} ROWS ONLY`;
      } else if (limitNum) {
        limitOffsetSql = `FETCH FIRST ${limitNum} ROWS ONLY`;
      } else if (offsetNum) {
        limitOffsetSql = `OFFSET ${offsetNum} ROWS`;
      }
    }
  }

  sql += selectLines.length > 0 ? selectLines[0] + '\n' : '';
  if (fromLine) sql += fromLine + '\n';
  if (joinLines.length) sql += joinLines.join('\n') + '\n';
  if (whereSql) sql += whereSql + '\n';
  if (groupByClauses.length) sql += 'GROUP BY ' + groupByClauses.join(', ') + '\n';
  if (havingSql) sql += havingSql + '\n';
  if (orderByClauses.length) sql += 'ORDER BY ' + orderByClauses.join(', ') + '\n';
  if (limitOffsetSql) sql += limitOffsetSql + '\n';

  return sql.trim();
}
