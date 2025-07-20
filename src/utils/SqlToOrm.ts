export function ChangeSqlToOrm(sql: string): string {
  let ormLines: string[] = [];

  // SELECT
  const selectMatch = sql.match(/SELECT\s+([\s\S]*?)\s+FROM/i);
  if (selectMatch) {
    const columns = selectMatch[1]
      .split(',')
      .map(col => col.trim())
      .map(col => `'${col}'`)
      .join(', ');
    ormLines.push(`->select(${columns})`);
  }

  // FROM (tabela e alias)
  const fromMatch = sql.match(/FROM\s+(\w+)(?:\s+(\w+))?/i);
  if (fromMatch) {
    const table = fromMatch[1];
    const alias = fromMatch[2] ?? table[0].toLowerCase();
    const className = table.charAt(0).toUpperCase() + table.slice(1).toLowerCase();
    ormLines.push(`->from(${className}::class, '${alias}')`);
  }

  // JOINs (LEFT, INNER, RIGHT)
  const joinRegex = /(LEFT|INNER|RIGHT)\s+JOIN\s+(\w+)\s+(\w+)\s+ON\s+([^\s]+)\s*=\s*([^\s]+)/gi;
  let joinMatch;
  while ((joinMatch = joinRegex.exec(sql)) !== null) {
    const joinType = joinMatch[1].toLowerCase();
    const table = joinMatch[2];
    const alias = joinMatch[3];
    const condition = `${joinMatch[4]} = ${joinMatch[5]}`;
    const className = table.charAt(0).toUpperCase() + table.slice(1);
    ormLines.push(`->${joinType}Join(${className}::class, '${alias}', 'WITH', '${condition}')`);
  }

  // WHERE (com AND/OR)
  const whereMatch = sql.match(/WHERE\s+([\s\S]*?)(GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|FETCH|$)/i);
  if (whereMatch) {
    const conditions = whereMatch[1]
      .trim()
      .split(/\s+(AND|OR)\s+/i)
      .filter(Boolean);
    let isFirst = true;
    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i].trim();
      if (cond.toUpperCase() === 'AND' || cond.toUpperCase() === 'OR') continue;

      if (isFirst) {
        ormLines.push(`->where('${cond}')`);
        isFirst = false;
      } else {
        const prevOp = conditions[i - 1].toUpperCase();
        if (prevOp === 'AND') {
          ormLines.push(`->andWhere('${cond}')`);
        } else if (prevOp === 'OR') {
          ormLines.push(`->orWhere('${cond}')`);
        }
      }
    }
  }

  // GROUP BY
  const groupByMatch = sql.match(/GROUP BY\s+([\s\S]*?)(HAVING|ORDER BY|LIMIT|OFFSET|FETCH|$)/i);
  if (groupByMatch) {
    ormLines.push(`->groupBy('${groupByMatch[1].trim()}')`);
  }

  // HAVING
  const havingMatch = sql.match(/HAVING\s+([\s\S]*?)(ORDER BY|LIMIT|OFFSET|FETCH|$)/i);
  if (havingMatch) {
    ormLines.push(`->having('${havingMatch[1].trim()}')`);
  }

  // ORDER BY
  const orderByMatch = sql.match(/ORDER BY\s+([\s\S]*?)(LIMIT|OFFSET|FETCH|$)/i);
  if (orderByMatch) {
    ormLines.push(`->orderBy('${orderByMatch[1].trim()}')`);
  }

  // LIMIT
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    ormLines.push(`->setMaxResults(${limitMatch[1]})`);
  }

  // OFFSET
  const offsetMatch = sql.match(/OFFSET\s+(\d+)/i);
  if (offsetMatch) {
    ormLines.push(`->setFirstResult(${offsetMatch[1]})`);
  }

  return `$queryBuilder\n  ${ormLines.join('\n  ')};`;
}
