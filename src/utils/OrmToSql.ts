export function changeOrmToSql(input: string, targetDb: string): string {
  let sql = '';

  const lines = input.split('\n').map(line => line.trim());

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
    if (line.startsWith('->select')) {
      const content = line.match(/'(.+)'/);
      if (content) selectLines.push(`SELECT ${content[1]}`);
    }

    if (line.startsWith('->from')) {
      const content = line.match(/'(.+?)',\s*'(.+?)'/);
      if (content) fromLine = `FROM ${content[1]} ${content[2]}`;
    }

    if (line.startsWith('->leftJoin') || line.startsWith('->innerJoin') || line.startsWith('->rightJoin')) {
      const type = line.startsWith('->leftJoin') ? 'LEFT JOIN' :
        line.startsWith('->innerJoin') ? 'INNER JOIN' : 'RIGHT JOIN';
      const content = line.match(/'(.+?)',\s*'(.+?)'/);
      if (content) joinLines.push(`${type} ${content[1]} ${content[2]} ON ???`);
    }

    // WHERE / AND WHERE / OR WHERE
    if (line.startsWith('->where') || line.startsWith('->andWhere') || line.startsWith('->orWhere')) {
      const content = line.match(/'(.+)'/);
      if (content) {
        if (line.startsWith('->where')) whereClauses.push(content[1]);
        else if (line.startsWith('->andWhere')) whereClauses.push('AND ' + content[1]);
        else if (line.startsWith('->orWhere')) whereClauses.push('OR ' + content[1]);
      }
    }

    // GROUP BY
    if (line.startsWith('->groupBy')) {
      const content = line.match(/'(.+)'/);
      if (content) groupByClauses.push(content[1]);
    }

    // HAVING / AND HAVING / OR HAVING
    if (line.startsWith('->having') || line.startsWith('->andHaving') || line.startsWith('->orHaving')) {
      const content = line.match(/'(.+)'/);
      if (content) {
        if (line.startsWith('->having')) havingClauses.push(content[1]);
        else if (line.startsWith('->andHaving')) havingClauses.push('AND ' + content[1]);
        else if (line.startsWith('->orHaving')) havingClauses.push('OR ' + content[1]);
      }
    }

    // ORDER BY
    if (line.startsWith('->orderBy') || line.startsWith('->addOrderBy')) {
      const content = line.match(/'(.+?)',\s*'(.+?)'/);
      if (content) orderByClauses.push(`${content[1]} ${content[2].toUpperCase()}`);
    }

    // Params
    if (line.startsWith('->setParameter')) {
      const param = line.match(/'(.+?)',\s*(.+)/);
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

  // -----------------------------
  // Substituir parâmetros nos WHERE / HAVING
  // -----------------------------
  const replaceParams = (clause: string) => {
    Object.entries(params).forEach(([key, val]) => {
      const finalVal = targetDb === 'oracle'
        ? (val === 'true' ? '1' : (val === 'false' ? '0' : val))
        : val;
      clause = clause.replace(new RegExp(`:${key}\\b`, 'g'), finalVal);
    });
    return clause;
  };

  const whereSql = whereClauses.length
    ? 'WHERE ' + whereClauses.map(c => replaceParams(c)).join(' ')
    : '';

  const havingSql = havingClauses.length
    ? 'HAVING ' + havingClauses.map(c => replaceParams(c)).join(' ')
    : '';

  // -----------------------------
  // Ajuste de LIMIT/OFFSET conforme banco alvo
  // -----------------------------
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

  // -----------------------------
  // Montar SQL Final
  // -----------------------------
  sql += selectLines.join('\n') + '\n';
  if (fromLine) sql += fromLine + '\n';
  if (joinLines.length) sql += joinLines.join('\n') + '\n';
  if (whereSql) sql += whereSql + '\n';
  if (groupByClauses.length) sql += 'GROUP BY ' + groupByClauses.join(', ') + '\n';
  if (havingSql) sql += havingSql + '\n';
  if (orderByClauses.length) sql += 'ORDER BY ' + orderByClauses.join(', ') + '\n';
  if (limitOffsetSql) sql += limitOffsetSql + '\n';

  return sql.trim();
}
