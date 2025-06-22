export function ChangeSqlToOrm(sql: string): string {
  let ormLines: string[] = [];

  // SELECT
  const selectMatch = sql.match(/SELECT\s+([\s\S]*?)\s+FROM/i);
  if (selectMatch) {
    ormLines.push(`->select('${selectMatch[1].trim()}')`);
  }

  // FROM (com ou sem alias)
  const fromMatch = sql.match(/FROM\s+(\w+)(?:\s+(\w+))?/i);
  if (fromMatch) {
    const table = fromMatch[1];
    const alias = fromMatch[2] ?? table[0]; // Se não tiver alias, usa a primeira letra da tabela
    ormLines.push(`->from('${table}', '${alias}')`);
  }

  // JOINs (LEFT, INNER, RIGHT JOINs com ON)
  const joinRegex = /(LEFT|INNER|RIGHT)\s+JOIN\s+(\w+)\s+(\w+)\s+ON\s+([^\s]+)\s*=\s*([^\s]+)/gi;
  let joinMatch;
  while ((joinMatch = joinRegex.exec(sql)) !== null) {
    const joinType = joinMatch[1].toLowerCase();
    const table = joinMatch[2];
    const alias = joinMatch[3];
    const leftSide = joinMatch[4];
    const rightSide = joinMatch[5];

    let parentAlias = '';
    let relation = '';

    const leftParts = leftSide.split('.');
    const rightParts = rightSide.split('.');

    if (leftParts.length === 2 && rightParts.length === 2) {
      const [leftAlias, leftField] = leftParts;
      const [rightAlias, rightField] = rightParts;

      if (rightField === 'id' && leftField.endsWith('_id')) {
        parentAlias = rightAlias;
        relation = leftField.slice(0, -3); // remove '_id'
      }
    }

    if (parentAlias && relation) {
      ormLines.push(`->${joinType}Join('${parentAlias}.${relation}', '${alias}')`);
    } else {
      ormLines.push(`->${joinType}Join('${table}', '${alias}')`);
    }
  }

  // WHERE (com AND / OR)
  const whereMatch = sql.match(/WHERE\s+([\s\S]*?)(GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|FETCH|$)/i);
  if (whereMatch) {
    const conditions = whereMatch[1].trim().split(/\s+(AND|OR)\s+/i);
    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i].trim();
      if (i === 0) {
        ormLines.push(`->where('${cond}')`);
      } else {
        const op = conditions[i - 1].toUpperCase();
        if (op === 'AND') {
          ormLines.push(`->andWhere('${cond}')`);
        } else if (op === 'OR') {
          ormLines.push(`->orWhere('${cond}')`);
        }
      }
      i++; // pula o operador
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

  // ORDER BY (cobre múltiplas colunas e ASC/DESC)
  const orderByMatch = sql.match(/ORDER BY\s+([\w\.\,\s]+?)(\s+ASC|\s+DESC|$)/i);
  if (orderByMatch) {
    const columns = orderByMatch[1].trim();
    const direction = (orderByMatch[2] || 'ASC').trim().toUpperCase();
    ormLines.push(`->orderBy('${columns}', '${direction}')`);
  }

  // OFFSET/FETCH NEXT (SQL Server / Oracle syntax)
  const offsetFetchMatch = sql.match(/OFFSET\s+(\d+)\s+ROWS\s+FETCH\s+NEXT\s+(\d+)\s+ROWS\s+ONLY/i);
  if (offsetFetchMatch) {
    ormLines.push(`->setFirstResult(${offsetFetchMatch[1]})`);
    ormLines.push(`->setMaxResults(${offsetFetchMatch[2]})`);
  }

  // LIMIT (MySQL/Postgres style)
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    ormLines.push(`->setMaxResults(${limitMatch[1]})`);
  }

  // OFFSET (MySQL/Postgres style, só se não tiver OFFSET/FETCH já detectado)
  const offsetMatch = sql.match(/OFFSET\s+(\d+)/i);
  if (offsetMatch && !offsetFetchMatch) {
    ormLines.push(`->setFirstResult(${offsetMatch[1]})`);
  }

  return '$queryBuilder\n  ' + ormLines.join('\n  ') + ';';
}
