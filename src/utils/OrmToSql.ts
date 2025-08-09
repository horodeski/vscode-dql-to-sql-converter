function parseExpr(expr: string): string {
	let result = expr;

	// Remove $qb->expr()->
	result = result.replace(/\$qb->expr\(\)->/g, "");

	// Operadores básicos
	result = result.replace(/gt\(\s*'([^']+)'\s*,\s*'?([^')]+)'?\s*\)/g, "$1 > $2");
	result = result.replace(/lt\(\s*'([^']+)'\s*,\s*'?([^')]+)'?\s*\)/g, "$1 < $2");
	result = result.replace(/eq\(\s*'([^']+)'\s*,\s*'?([^')]+)'?\s*\)/g, "$1 = $2");
	result = result.replace(/lte\(\s*'([^']+)'\s*,\s*'?([^')]+)'?\s*\)/g, "$1 <= $2");
	result = result.replace(/gte\(\s*'([^']+)'\s*,\s*'?([^')]+)'?\s*\)/g, "$1 >= $2");
	result = result.replace(/neq\(\s*'([^']+)'\s*,\s*'?([^')]+)'?\s*\)/g, "$1 <> $2");
	result = result.replace(/in\(\s*'([^']+)'\s*,\s*([^)]*)\)/g, "$1 IN ($2)");
	result = result.replace(/notIn\(\s*'([^']+)'\s*,\s*([^)]*)\)/g, "$1 NOT IN ($2)");
	result = result.replace(/isNotNull\(\s*'([^']+)'\s*\)/g, "$1 IS NOT NULL");
	result = result.replace(/isNull\(\s*'([^']+)'\s*\)/g, "$1 IS NULL");

	// Funções compostas andX, orX (que recebem múltiplas expressões)
	const parseX = (inner: string, separator: string): string => {
		const parts: string[] = [];
		let current = "";
		let parenLevel = 0;

		for (let i = 0; i < inner.length; i++) {
			const char = inner[i];
			if (char === "(") parenLevel++;
			else if (char === ")") parenLevel--;
			if (char === "," && parenLevel === 0) {
				if (current.trim()) parts.push(parseExpr(current.trim()));
				current = "";
			} else {
				current += char;
			}
		}
		if (current.trim()) parts.push(parseExpr(current.trim()));

		return "(" + parts.join(` ${separator} `) + ")";
	};

	// Detecta andX(...)
	const andXMatch = result.match(/^andX\(([\s\S]*)\)$/);
	if (andXMatch) {
		return parseX(andXMatch[1], "AND");
	}

	// Detecta orX(...)
	const orXMatch = result.match(/^orX\(([\s\S]*)\)$/);
	if (orXMatch) {
		return parseX(orXMatch[1], "OR");
	}

	return result;
}

function parseSubquery(subqueryString: string): string {
	// More robust subquery extraction
	const patterns = [/\$em->createQueryBuilder\(\)([\s\S]*?)(?:->getDQL\(\)|$)/, /createQueryBuilder\(\)([\s\S]*?)(?:->getDQL\(\)|$)/];

	let subqueryMatch = null;
	for (const pattern of patterns) {
		subqueryMatch = subqueryString.match(pattern);
		if (subqueryMatch) break;
	}

	if (!subqueryMatch) {
		return "SUBQUERY_ERROR";
	}

	const subqueryContent = subqueryMatch[1];

	// Parse the subquery using the same logic as the main query
	const subquerySql = changeOrmToSql(subqueryContent, "mysql");

	// Return as parenthesized subquery
	return `(${subquerySql})`;
}

function splitSelectArguments(input: string) {
	const args: string[] = [];
	let current = "";
	let inQuotes = false;
	let quoteChar = "";
	let parenCount = 0;

	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		const prev = i > 0 ? input[i - 1] : "";

		if ((char === '"' || char === "'") && prev !== "\\") {
			if (inQuotes && char === quoteChar) {
				inQuotes = false;
				quoteChar = "";
			} else if (!inQuotes) {
				inQuotes = true;
				quoteChar = char;
			}
			current += char;
		} else if (!inQuotes && char === "(") {
			parenCount++;
			current += char;
		} else if (!inQuotes && char === ")") {
			parenCount--;
			current += char;
		} else if (!inQuotes && parenCount === 0 && char === ",") {
			args.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}

	if (current.trim() !== "") args.push(current.trim());

	return args;
}

// Improved function to split WHERE arguments that can contain complex expressions
function splitWhereArguments(input: string) {
	const args: string[] = [];
	let current = "";
	let parenCount = 0;
	let inQuotes = false;
	let quoteChar = "";

	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		const prev = i > 0 ? input[i - 1] : "";

		if ((char === '"' || char === "'") && prev !== "\\") {
			if (inQuotes && char === quoteChar) {
				inQuotes = false;
				quoteChar = "";
			} else if (!inQuotes) {
				inQuotes = true;
				quoteChar = char;
			}
			current += char;
		} else if (!inQuotes && char === "(") {
			parenCount++;
			current += char;
		} else if (!inQuotes && char === ")") {
			parenCount--;
			current += char;
		} else if (!inQuotes && parenCount === 0 && char === ",") {
			args.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}

	if (current.trim() !== "") args.push(current.trim());

	return args;
}

function processComplexSelectArgument(arg: string): string {
	arg = arg.trim();

	// Handle string concatenation with subqueries
	if (arg.includes("'") && arg.includes(".") && arg.includes("$em->createQueryBuilder()")) {
		// Pattern: '(' . $em->createQueryBuilder()...->getDQL() . ') AS alias'
		const concatenationMatch = arg.match(/^'([^']*)'?\s*\.\s*(.*?)\s*\.\s*'([^']*)'\s*(AS\s+\w+)?$/i);
		if (concatenationMatch) {
			const prefix = concatenationMatch[1];
			const subqueryPart = concatenationMatch[2];
			const suffix = concatenationMatch[3];
			const asClause = concatenationMatch[4] || "";

			const subquerySql = parseSubquery(subqueryPart);
			return `${prefix}${subquerySql}${suffix} ${asClause}`.trim();
		}
	}

	// Handle standalone subqueries
	if (arg.includes("$em->createQueryBuilder()")) {
		const subquerySql = parseSubquery(arg);
		// Extract AS clause if present
		const asMatch = arg.match(/AS\s+(\w+)/i);
		return asMatch ? `${subquerySql} AS ${asMatch[1]}` : subquerySql;
	}

	// Remove outer quotes only if they wrap the entire argument and it's not a complex expression
	if ((arg.startsWith("'") && arg.endsWith("'")) || (arg.startsWith('"') && arg.endsWith('"'))) {
		const inner = arg.slice(1, -1);

		// If it contains a processed subquery, keep it as is
		if (inner.includes("SELECT ") || inner.startsWith("(SELECT")) {
			return inner;
		}

		// If it's a simple string without special SQL syntax, remove quotes
		if (
			!inner.includes("CASE ") &&
			!inner.includes("SUM(") &&
			!inner.includes("COUNT(") &&
			!inner.includes("AVG(") &&
			!inner.includes("MAX(") &&
			!inner.includes("MIN(")
		) {
			return inner;
		}

		return inner;
	}

	return arg;
}

// Improved function to extract table name from class
function extractTableFromClass(classReference: string): string {
	// Remove ::class if present
	let tableName = classReference.replace("::class", "");

	// Remove namespace if present (App\Entity\, etc.)
	tableName = tableName.replace(/^.*\\/, "");

	// Convert remaining camelCase/PascalCase to lowercase
	tableName = tableName
		.replace(/([a-z])([A-Z])/g, "$1$2") // Handle normal camelCase
		.toLowerCase();

	return tableName;
}

export function changeOrmToSql(input: string, targetDb: string): string {
	let sql = "";
	const params: Record<string, string> = {};
	// Pre-process to handle complex subqueries with string concatenation
	let processedInput = input;

	// Handle complex subqueries with concatenation - improved regex to handle nested parentheses
	processedInput = processedInput.replace(
		/'([^']*)'?\s*\.\s*(\$em->createQueryBuilder\(\)[\s\S]*?->getDQL\(\))\s*\.\s*'([^']*)'\s*(AS\s+\w+)?/gi,
		(match, prefix, subqueryPart, suffix, asClause) => {
			const subquerySql = parseSubquery(subqueryPart);
			return `'${prefix}${subquerySql}${suffix}' ${asClause || ""}`.trim();
		}
	);

	// Also handle cases where the subquery is standalone
	processedInput = processedInput.replace(/\$em->createQueryBuilder\(\)([\s\S]*?)(?:->getDQL\(\)|(?=\s*\)\s*AS))/g, (match, subqueryContent) => {
		const subquerySql = parseSubquery(match);
		return subquerySql;
	});

	// Normalize input: preserve structure but clean up spacing
	let normalizedInput = processedInput
		.replace(/\s*\n\s*/g, " ") // Replace newlines with single space
		.replace(/\s+/g, " ") // Collapse multiple spaces
		.trim();

	// More aggressive method call splitting that respects nested function calls
	const calls: string[] = [];
	let current = "";
	let parenDepth = 0;
	let inString = false;
	let stringChar = "";

	for (let i = 0; i < normalizedInput.length; i++) {
		const char = normalizedInput[i];
		const prev = i > 0 ? normalizedInput[i - 1] : "";

		if (!inString && (char === "'" || char === '"') && prev !== "\\") {
			inString = true;
			stringChar = char;
		} else if (inString && char === stringChar && prev !== "\\") {
			inString = false;
			stringChar = "";
		}

		if (!inString) {
			if (char === "(") parenDepth++;
			if (char === ")") parenDepth--;

			if (char === "-" && normalizedInput[i + 1] === ">" && parenDepth === 0) {
				if (current.trim()) calls.push(current.trim());
				current = "";
				i++; // Skip the '>'
				continue;
			}
		}

		current += char;
	}

	if (current.trim()) calls.push(current.trim());

	const selectLines: string[] = [];
	let fromLine = "";
	const joinLines: string[] = [];
	const whereClauses: string[] = [];
	const groupByClauses: string[] = [];
	const havingClauses: string[] = [];
	const orderByClauses: string[] = [];
	let limitLine = "";
	let offsetLine = "";

	for (const call of calls) {
		// ->select
		if (call.startsWith("select")) {
			const selectMatch = call.match(/select\s*\(\s*([\s\S]*?)\s*\)(?:\s*->|$)/);
			if (selectMatch) {
				const selectContent = selectMatch[1];
				const args = splitSelectArguments(selectContent).map(processComplexSelectArgument);
				selectLines.push("SELECT " + args.join(", "));
			}
		}

		// ->from
		if (call.startsWith("from")) {
			const content = call.match(/\(\s*(?:'([^']+)'|([A-Za-z_\\:]+))\s*,\s*'([^']+)'\s*\)/);
			if (content) {
				const classOrTable = content[1] || content[2];
				const alias = content[3];

				// If contains ::class, extract table name
				let table;
				if (classOrTable.includes("::class") || classOrTable.includes("\\")) {
					table = extractTableFromClass(classOrTable);
				} else {
					table = classOrTable;
				}

				fromLine = `FROM ${table} ${alias}`;
			}
		}

		// ->join
		if (call.startsWith("leftJoin") || call.startsWith("innerJoin") || call.startsWith("rightJoin")) {
			const type = call.startsWith("leftJoin") ? "LEFT JOIN" : call.startsWith("innerJoin") ? "INNER JOIN" : "RIGHT JOIN";

			// Pattern for 4 parameters with expressions: innerJoin(Class::class, 'alias', 'WITH', $qb->expr()->andX(...))
			let fourParamExprMatch = call.match(/(\w+Join)\(\s*([A-Za-z_\\:]+)\s*,\s*'([^']+)'\s*,\s*['"](WITH|ON)['"]\s*,\s*(.*)\s*\)$/);

			if (fourParamExprMatch) {
				const classOrTable = fourParamExprMatch[2];
				const alias = fourParamExprMatch[3];
				let condition = fourParamExprMatch[5];

				// Extract table name from class
				let tableName;
				if (classOrTable.includes("::class") || classOrTable.includes("\\")) {
					tableName = extractTableFromClass(classOrTable);
				} else {
					tableName = classOrTable;
				}

				// Handle expressions like $qb->expr()->andX(...)
				if (condition.includes("$qb->expr()")) {
					condition = parseExpr(condition);
				}
				// Handle simple string conditions (remove quotes)
				else if ((condition.startsWith('"') && condition.endsWith('"')) || (condition.startsWith("'") && condition.endsWith("'"))) {
					condition = condition.slice(1, -1);
				}

				joinLines.push(`${type} ${tableName} ${alias} ON ${condition}`);
				continue;
			}

			// Pattern for 4 parameters with simple string conditions: innerJoin(Class::class, 'alias', 'WITH', 'condition')
			let fourParamMatch = call.match(/(\w+Join)\(\s*([A-Za-z_\\:]+)\s*,\s*'([^']+)'\s*,\s*['"](WITH|ON)['"]\s*,\s*['"](.*?)['"]\s*\)/);

			if (fourParamMatch) {
				const classOrTable = fourParamMatch[2];
				const alias = fourParamMatch[3];
				const condition = fourParamMatch[5];

				// Extract table name from class
				let tableName;
				if (classOrTable.includes("::class") || classOrTable.includes("\\")) {
					tableName = extractTableFromClass(classOrTable);
				} else {
					tableName = classOrTable;
				}

				joinLines.push(`${type} ${tableName} ${alias} ON ${condition}`);
				continue;
			}

			// Original pattern for relationships
			let joinMatch = call.match(
				/(\w+Join)\(\s*'([^']+)'\s*,\s*'([^']+)'\s*(?:,\s*[^,]*,\s*'([^']+)'|,\s*Expr\\Join::WITH,\s*'([^']+)')?\s*\)/
			);

			if (joinMatch) {
				const relation = joinMatch[2];
				const alias = joinMatch[3];
				let condition = joinMatch[4] || joinMatch[5] || "";

				if (relation.includes(".")) {
					const [parentAlias, relationName] = relation.split(".");
					// Convert entity relation to table name (add proper pluralization)
					let tableName = relationName.toLowerCase();
					if (relationName === "category") tableName = "categories";
					else if (!tableName.endsWith("s")) tableName += "s";

					if (!condition) {
						condition = `${parentAlias}.id = ${alias}.${parentAlias}_id`;
					}
					joinLines.push(`${type} ${tableName} ${alias} ON ${condition}`);
				} else {
					// Direct table reference
					const tableName = relation.replace(/^App\\Entity\\/, "");
					joinLines.push(`${type} ${tableName} ${alias} ON ${condition || "1=1"}`);
				}
			}
		}
		// ->where
		if (call.startsWith("where") || call.startsWith("andWhere") || call.startsWith("orWhere")) {
			// Regex to capture all content between parentheses
			const content = call.match(/\(([\s\S]+)\)/);

			if (content) {
				let whereContent = content[1].trim();
				// Check if this is a single $qb->expr() call with multiple arguments
				const exprCallMatch = whereContent.match(/^\s*\$qb->expr\(\)->\w+\s*\(/);

				if (exprCallMatch) {
					// Single expression method call - parse as one unit
					let parsed = parseExpr(whereContent);
					if (parsed && parsed.length > 0 && !parsed.includes("$qb->expr(")) {
						// Add clause without prepending AND or OR
						whereClauses.push(parsed);
					}
				} else {
					// Multiple separate arguments - split and process each
					const whereArgs = splitWhereArguments(whereContent);

					for (let i = 0; i < whereArgs.length; i++) {
						let parsed = whereArgs[i].trim();

						// Handle $qb->expr() calls - extract the actual expression
						if (parsed.includes("$qb->expr()->")) {
							parsed = parseExpr(parsed);
						} else {
							// Simple string condition - remove quotes
							parsed = parsed.replace(/^['"]|['"]$/g, "");
						}

						// Skip empty or malformed expressions
						if (parsed && parsed.length > 0 && !parsed.includes("$qb->expr(")) {
							// Add clause without prepending AND or OR
							whereClauses.push(parsed);
						}
					}
				}
			}
		}

		// ->groupBy
		if (call.startsWith("groupBy")) {
			const content = call.match(/\(\s*['"](.+?)['"]\s*\)/);
			if (content) groupByClauses.push(content[1]);
		}

		// ->having
		if (call.startsWith("having") || call.startsWith("andHaving") || call.startsWith("orHaving")) {
			const content = call.match(/\(([\s\S]+?)\)(?:\s*->|$)/);
			if (content) {
				let parsed = content[1].trim();

				// Handle $qb->expr() calls - extract the actual expression
				if (parsed.includes("$qb->expr()->")) {
					parsed = parseExpr(parsed);
				} else {
					// Simple string condition - remove quotes
					parsed = parsed.replace(/^['"]|['"]$/g, "");
				}

				// Skip empty or malformed expressions
				if (parsed && !parsed.includes("$qb->expr(")) {
					if (call.startsWith("having")) havingClauses.push(parsed);
					else if (call.startsWith("andHaving")) havingClauses.push("AND " + parsed);
					else if (call.startsWith("orHaving")) havingClauses.push("OR " + parsed);
				}
			}
		}

		// ->orderBy
		if (call.startsWith("orderBy") || call.startsWith("addOrderBy")) {
			const content = call.match(/\(\s*['"](.+?)['"]\s*,\s*['"](.+?)['"]\s*\)/);
			if (content) {
				orderByClauses.push(`${content[1]} ${content[2].toUpperCase()}`);
			}
		}

		// ->setParameters
		if (call.startsWith("setParameters")) {
			const paramMatch = call.match(/setParameters\(\s*\[([\s\S]*?)\]\s*\)/);
			if (paramMatch) {
				const paramsBlock = paramMatch[1];
				const paramLines = paramsBlock
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean);
				for (const paramLine of paramLines) {
					const kvMatch = paramLine.match(/['"]([^'"]+)['"]\s*=>\s*([^,]+)/);
					if (kvMatch) {
						const key = kvMatch[1];
						let val = kvMatch[2].trim().replace(/^['"]|['"]$/g, "");
						params[key] = val;
					}
				}
			}
		}

		// ->setParameter
		if (call.startsWith("setParameter")) {
			const paramMatch = call.match(/setParameter\(\s*['"]([^'"]+)['"]\s*,\s*(.+?)\s*\)/);
			if (paramMatch) {
				const key = paramMatch[1];
				let val = paramMatch[2].trim();

				// Handle arrays like ['completed', 'shipped']
				if (val.startsWith("[") && val.endsWith("]")) {
					val = val
						.slice(1, -1)
						.split(",")
						.map((v) => v.trim().replace(/^['"]|['"]$/g, ""))
						.join(", ");
				} else {
					val = val.replace(/^['"]|['"]$/g, "");
				}

				params[key] = val;
			}
		}

		// ->setMaxResults
		if (call.startsWith("setMaxResults")) {
			const number = call.match(/\((\d+)\)/);
			if (number) limitLine = `LIMIT ${number[1]}`;
		}
		
		// ->setFirstResult
		if (call.startsWith("setFirstResult")) {
			const number = call.match(/\((\d+)\)/);
			if (number) offsetLine = `OFFSET ${number[1]}`;
		}
	}

	// Replace parameters in clauses
	const replaceParams = (clause: string) => {
		Object.entries(params).forEach(([key, val]) => {
			val = val
				.trim()
				.replace(/^\(+|\)+$/g, "")
				.replace(/->value$/, "");

			// Handle different value types
			let finalVal;
			if (val === "true" || val === "false") {
				finalVal = val === "true" ? "1" : "0"; // Convert boolean to SQL
			} else if (val.includes(",") && !val.startsWith("(")) {
				// Array values like "completed, shipped" should be quoted individually and not double-wrapped
				const arrayValues = val
					.split(",")
					.map((v) => `'${v.trim()}'`)
					.join(", ");
				finalVal = `(${arrayValues})`;
			} else if (val.startsWith("$") || val.includes("Date")) {
				// Keep parameter placeholders and date variables as is
				finalVal = val;
			} else if (isNaN(Number(val))) {
				finalVal = `'${val}'`;
			} else {
				finalVal = val;
			}

			clause = clause.replace(new RegExp(`:${key}\\b`, "g"), finalVal);
		});
		return clause;
	};

	// Apply parameter replacement to all clauses that might contain parameters
	const processedWhereClauses = whereClauses.map((clause) => replaceParams(clause));
	const processedSelectLines = selectLines.map((line) => replaceParams(line));

	let whereSql = "";
	if (processedWhereClauses.length) {
		// Split by commas and join with AND
		let clauses: string[] = [];
		processedWhereClauses.forEach((clause) => {
			const splitClauses = clause.split(",").map((c) => c.trim());
			clauses = clauses.concat(splitClauses);
		});

		const validClauses = clauses.filter((clause) => clause.length > 0);
		// Handle OR conditions explicitly
		if (validClauses.length) {
			let sqlParts: string[] = [];

			validClauses.forEach((clause, i) => {
				if (clause.startsWith("OR ")) {
					sqlParts.push(clause);
				} else {
					if (i === 0) {
						sqlParts.push(clause);
					} else {
						sqlParts.push("AND " + clause);
					}
				}
			});

			whereSql = "WHERE " + sqlParts.join(" ");
		}
	}

	let havingSql = "";
	if (havingClauses.length) {
		const processedHavingClauses = havingClauses.map((clause) => replaceParams(clause));
		havingSql = "HAVING " + processedHavingClauses.join(" ");
	}

	let limitOffsetSql = "";
	if (limitLine || offsetLine) {
		if (targetDb === "mysql" || targetDb === "postgres") {
			limitOffsetSql = [limitLine, offsetLine].filter(Boolean).join(" ");
		} else if (targetDb === "oracle") {
			const limitNum = limitLine ? limitLine.replace("LIMIT ", "") : "";
			const offsetNum = offsetLine ? offsetLine.replace("OFFSET ", "") : "";
			if (limitNum && offsetNum) {
				limitOffsetSql = `OFFSET ${offsetNum} ROWS FETCH NEXT ${limitNum} ROWS ONLY`;
			} else if (limitNum) {
				limitOffsetSql = `FETCH FIRST ${limitNum} ROWS ONLY`;
			} else if (offsetNum) {
				limitOffsetSql = `OFFSET ${offsetNum} ROWS`;
			}
		}
	}

	sql += processedSelectLines.length > 0 ? processedSelectLines[0] + "\n" : "";
	if (fromLine) sql += fromLine + "\n";
	if (joinLines.length) sql += joinLines.join("\n") + "\n";
	if (whereSql) sql += whereSql + "\n";
	if (groupByClauses.length) sql += "GROUP BY " + groupByClauses.join(", ") + "\n";
	if (havingSql) sql += havingSql + "\n";
	if (orderByClauses.length) sql += "ORDER BY " + orderByClauses.join(", ") + "\n";
	if (limitOffsetSql) sql += limitOffsetSql + "\n";

	return sql.trim();
}
