'use strict';

// parser for http://lucene.apache.org/core/4_10_2/queryparser/org/apache/lucene/queryparser/classic/package-summary.html#package_description
// Reference to original lucene query parser https://svn.apache.org/repos/asf/lucene/dev/trunk/lucene/queryparser/src/java/org/apache/lucene/queryparser/classic/QueryParser.jj

export interface Visitor {
    visit(ast: AST);
    visitMissingAST(ast: MissingAST);
    visitTermAST(ast: TermAST);
    visitTermWithFieldAST(ast: TermWithFieldAST);
    visitExpressionList(ast: ExpressionAST);
    visitExpressionListAST(ast: ExpressionListAST);
}

export class BaseVisitor implements Visitor {
    visit(ast: AST) {
        if (ast === null) {
            return;
        } else if (ast instanceof ExpressionListAST) {
            this.visitExpressionListAST(ast);
        } else if (ast instanceof ExpressionAST) {
            this.visitExpressionList(ast);
        } else if (ast instanceof TermWithFieldAST) {
            this.visitTermWithFieldAST(ast);
        } else if (ast instanceof TermAST) {
            this.visitTermAST(ast);
        } else if (ast instanceof MissingAST) {
            this.visitMissingAST(ast);
        } else {
            throw Error("Encountered AST of unknown type: " + JSON.stringify(ast));
        }
    }

    visitMissingAST(ast: MissingAST) {
    }

    visitTermAST(ast: TermAST) {
    }

    visitTermWithFieldAST(ast: TermWithFieldAST) {
    }

    visitExpressionList(ast: ExpressionAST) {
    }

    visitExpressionListAST(ast: ExpressionListAST) {
    }


}
export class DumpVisitor extends BaseVisitor implements Visitor {
    private buffer = [];

    visitMissingAST(ast: MissingAST) {
        this.dumpPrefix(ast);
        this.dumpSuffix(ast);
    }

    visitTermAST(ast: TermAST) {
        this.dumpWithPrefixAndSuffix(ast);
    }

    visitTermWithFieldAST(ast: TermWithFieldAST) {
        this.dumpWithPrefixAndSuffixWithField(ast);
    }

    visitExpressionList(ast: ExpressionAST) {
        this.dumpPrefix(ast);
        this.visit(ast.left);
        this.dumpToken(ast.op);
        this.visit(ast.right);
        this.dumpSuffix(ast);
    }

    visitExpressionListAST(ast: ExpressionListAST) {
        this.dumpPrefix(ast);
        var exprList = <ExpressionListAST>ast;
        exprList.expressions.forEach((expr) => this.visit(expr));
        this.dumpSuffix(ast);
    }

    private dumpWithPrefixAndSuffix(ast: TermAST) {
        this.dumpPrefix(ast);
        this.dumpToken(ast.term);
        this.dumpSuffix(ast);
    }

    private dumpWithPrefixAndSuffixWithField(ast: TermWithFieldAST) {
        this.dumpPrefix(ast);
        this.dumpToken(ast.field);
        this.dumpHidden(ast.hiddenColonPrefix);
        this.dumpToken(ast.colon);
        this.dumpHidden(ast.hiddenColonSuffix);
        this.dumpToken(ast.term);
        this.dumpSuffix(ast);
    }

    private dumpSuffix(ast: AST) {
        this.dumpHidden(ast.hiddenSuffix);
    }

    private dumpHidden(hidden: Array<Token>) {
        hidden.forEach((token) => this.dumpToken(token));
    }

    private dumpPrefix(ast: AST) {
        this.dumpHidden(ast.hiddenPrefix);
    }

    private dumpToken(token: Token) {
        token !== null && this.buffer.push(token.asString());
    }

    result() {
        return this.buffer.join("");
    }

}

export enum TokenType {
    EOF, WS, TERM, PHRASE, AND, OR, NOT, COLON, ERROR
}

class AST {
    hiddenPrefix: Array<Token> = [];
    hiddenSuffix: Array<Token> = [];
}

class MissingAST extends AST {

}

export class ExpressionAST extends AST {
    constructor(public left: TermAST, public op: Token,
                public right: AST) {
        super();
    }
}

export class TermAST extends AST {
    constructor(public term: Token) {
        super();
    }

    isPhrase() {
        return this.term.asString().indexOf(" ") !== -1;
    }
}

export class TermWithFieldAST extends TermAST {
    hiddenColonPrefix: Array<Token> = [];
    hiddenColonSuffix: Array<Token> = [];

    constructor(public field: Token, public colon: Token, term: Token) {
        super(term);
    }

}

export class ExpressionListAST extends AST {
    public expressions = Array<AST>();

    constructor(...expressions: AST[]) {
        super();
        this.expressions = this.expressions.concat(expressions);
    }

    add(expr: AST) {
        this.expressions.push(expr);
    }
}

export class Token {
    // for better readability
    public typeName: string;

    constructor(private input: string, public type: TokenType, public beginPos: number, public endPos: number) {
        this.typeName = TokenType[type];
    }

    asString() {
        return this.input.substring(this.beginPos, this.endPos);
    }

}

class QueryLexer {
    public pos: number;
    private eofToken: Token;

    constructor(private input: string) {
        this.pos = 0;
        this.eofToken = new Token(this.input, TokenType.EOF, input.length - 1, input.length - 1);
    }

    next(): Token {
        var token;
        var la = this.la();
        if (la === null) {
            token = this.eofToken;
        } else if (this.isWhitespace(la)) {
            token = this.whitespace();
        } else if (this.isKeyword("OR") || this.isKeyword("||")) {
            token = this.or();
        } else if (this.isKeyword("AND") || this.isKeyword("&&")) {
            token = this.and();
        } else if (la === '"') {
            token = this.phrase();
        } else if (la === ':') {
            var startPos = this.pos;
            this.consume();
            token = new Token(this.input, TokenType.COLON, startPos, this.pos);
        } else if (la[0] === '\\' && la.length === 1) {
            // we have an escape character, but nothing that is escaped, we consider this an error
            this.pos--;
            var startPos = this.pos;
            this.consume();
            token = new Token(this.input, TokenType.ERROR, startPos, this.pos);
        } else if (this.isTermStart(la)) {
            token = this.term();
        } else {
            var startPos = this.pos;
            this.consume();
            token = new Token(this.input, TokenType.ERROR, startPos, this.pos);
        }
        return token;
    }

    isKeyword(keyword: string): boolean {
        for (var i = 0; i < keyword.length; i++) {
            if (this.la(i) !== keyword[i]) {
                return false;
            }
        }
        // be sure that it is not a prefix of something else
        return this.isWhitespace(this.la(i)) || this.la(i) === null;
    }

    or() {
        var startPos = this.pos;
        this.consume(2);
        return new Token(this.input, TokenType.OR, startPos, this.pos);
    }

    and() {
        var startPos = this.pos;
        this.consume(this.la() === '&' ? 2 : 3);
        return new Token(this.input, TokenType.AND, startPos, this.pos);
    }

    whitespace() {
        var startPos = this.pos;
        var la = this.la();
        while (this.isWhitespace(la)) {
            this.consume();
            la = this.la();
        }
        return new Token(this.input, TokenType.WS, startPos, this.pos);
    }

    term() {
        var startPos = this.pos;
        // consume start character
        this.consume();
        var la = this.la();
        while (this.isTerm(la)) {
            this.consume();
            la = this.la();
        }
        return new Token(this.input, TokenType.TERM, startPos, this.pos);
    }

    phrase() {
        var startPos = this.pos;
        this.consume(); // skip starting "
        var la = this.la();
        while (la !== null && la !== '"') {
            this.consume();
            la = this.la();
        }
        this.consume(); // skip ending "
        return new Token(this.input, TokenType.PHRASE, startPos, this.pos);
    }

    isDigit(char) {
        return char !== null && (('a' <= char && char <= 'z') || ('A' <= char && char <= 'Z') || ('0' <= char && char <= '9'));
    }

    isOneOf(set: string, char: string) {
        return set.indexOf(char) !== -1;
    }

    isWhitespace(char) {
        return this.isOneOf(' \t\n\r\u3000', char);
    }

    isSpecial(char) {
        return this.isOneOf('+-!():^[]"{}~*?\\/', char);
    }

    isTermStart(char) {
        return char !== null && !this.isWhitespace(char) && !this.isSpecial(char);
    }

    isTerm(char) {
        return this.isTermStart(char) || this.isOneOf('+-', char);
    }

    isEscaped(char) {
        return char.length === 2 && char[0] === '\\';
    }

    consume(n: number = 1) {
        this.pos += n;
    }

    la(la: number = 0): string {
        var index = this.pos + la;
        var char = (this.input.length <= index) ? null : this.input[index];
        if (char === '\\') {
            this.consume();
            if (this.input.length <= index) {
                var escapedChar = this.input[index]
                char += escapedChar;
            }
        }
        return char;
    }
}

export interface ErrorObject {
    position: number;
    message: string;
}

export class QueryParser {
    private lexer: QueryLexer;
    private tokenBuffer: Array<Token>;
    public errors: Array<ErrorObject> = [];

    constructor(private input: string) {
        this.lexer = new QueryLexer(input);
        this.tokenBuffer = [];
    }

    private consume() {
        this.tokenBuffer.splice(0, 1);
    }

    private la(la: number = 0): Token {
        // fill token buffer until we can look far ahead
        while (la >= this.tokenBuffer.length) {
            var token = this.lexer.next();
            if (token.type === TokenType.EOF) {
                return token;
            }
            this.tokenBuffer.push(token);
        }
        return this.tokenBuffer[la];
    }

    private skipHidden(): Array<Token> {
        var skippedTokens = this.syncWhile(TokenType.WS, TokenType.ERROR);
        skippedTokens.filter((token) => token.type === TokenType.ERROR).forEach((errorToken) => {
            this.errors.push({
                position: errorToken.beginPos,
                message: "Unexpected input: '" + errorToken.asString() + "'"
            });
        });
        return skippedTokens;
    }

    private syncWhile(...syncWhile: TokenType[]): Array<Token> {
        var skippedTokens = [];
        while (syncWhile.some((type) => type === this.la().type)) {
            skippedTokens.push(this.la());
            this.consume();
        }
        return skippedTokens;
    }

    private syncTo(syncTo: TokenType[]): Array<Token> {
        var skippedTokens = [];
        while (this.la().type !== TokenType.EOF && syncTo.every((type) => type !== this.la().type)) {
            skippedTokens.push(this.la());
            this.consume();
        }
        return skippedTokens;
    }

    private unexpectedToken(...syncTo: TokenType[]) {
        this.errors.push({
            position: this.la().beginPos,
            message: "Unexpected input"
        });
        return this.syncTo(syncTo);
    }

    private missingToken(tokenName: string, ...syncTo: TokenType[]) {
        this.errors.push({
            position: this.la().beginPos,
            message: "Missing " + tokenName
        });
        return this.syncTo(syncTo);
    }

    parse(): AST {
        this.errors = [];
        var ast: AST;
        var prefix = this.skipHidden();
        if (this.isExpr()) {
            ast = this.exprs();
        } else {
            ast = new MissingAST();
        }
        ast.hiddenPrefix = ast.hiddenPrefix.concat(prefix);
        var trailingSuffix = this.skipHidden();
        ast.hiddenSuffix = ast.hiddenSuffix.concat(trailingSuffix);
        return ast;
    }

    exprs(): AST {
        var expr = this.expr();

        if (!this.isExpr()) {
            return expr;
        } else {
            var expressionList = new ExpressionListAST();
            expressionList.add(expr);
            while (this.isExpr()) {
                expr = this.expr();
                expressionList.add(expr);
            }
            return expressionList;
        }
    }

    expr(): AST {
        var left: TermAST = null;
        var op: Token = null;
        var right: AST = null;

        // left
        if (this.isExpr()) {
            left = this.termOrPhrase();
            left.hiddenSuffix = left.hiddenSuffix.concat(this.skipHidden());
        } else {
            this.unexpectedToken(TokenType.EOF);
        }

        if (!this.isOperator()) {
            return left;
        } else {
            op = this.la();
            this.consume();
            var prefix = this.skipHidden();
            if (this.isExpr()) {
                right = this.expr();
            } else {
                this.missingToken("right side of expression", TokenType.EOF);
                right = new MissingAST();
            }
            right.hiddenPrefix = prefix;
            return new ExpressionAST(left, op, right);
        }
    }

    isFirstOf(...tokenTypes: TokenType[]) {
        return tokenTypes.some((tokenType) => this.la().type === tokenType);
    }

    isExpr() {
        return this.isFirstOf(TokenType.TERM, TokenType.PHRASE);
    }

    isOperator() {
        return this.isFirstOf(TokenType.OR, TokenType.AND);
    }

    termOrPhrase() {
        var termOrField = this.la();
        this.consume();
        var wsAfterTermOrField = this.skipHidden();
        // no ws allowed here
        if (this.la().type === TokenType.COLON) {
            var colon = this.la();
            this.consume();
            var prefixAfterColon = this.skipHidden();
            if (this.la().type === TokenType.TERM || this.la().type === TokenType.PHRASE) {
                var term = this.la();
                this.consume();
                var ast = new TermWithFieldAST(termOrField, colon, term);
                ast.hiddenColonPrefix = wsAfterTermOrField;
                ast.hiddenColonSuffix = prefixAfterColon;
                return ast;
            } else {
                var skippedTokens = this.missingToken("term or phrase for field", TokenType.EOF);
                var ast = new TermWithFieldAST(termOrField, colon, null);
                ast.hiddenColonPrefix = wsAfterTermOrField;
                ast.hiddenColonSuffix = prefixAfterColon;
                ast.hiddenSuffix = skippedTokens;
                return ast;
            }
        }
        var termAST = new TermAST(termOrField);
        termAST.hiddenSuffix = wsAfterTermOrField;
        return termAST;
    }
}

