const parser = require('slimdom-sax-parser')
import {XMLDocument, Element} from "slimdom"
import {makeXmlProxy, Rule} from "./index"

const sampleXml = `
<root xmlns:y="http://localhost/yellow" xmlns:g="http://localhost/green">
    <tree>
        <branch>br1</branch>
        <branch>br2</branch>
    </tree>
    <plant type="shrub"/>
    <plant type="bush"/>
    <option value="true">
        <value>false</value>
    </option>
    <y:yellow a="b">
        text
    </y:yellow>
    <g:yellow>green</g:yellow>
</root>
`
const document:XMLDocument = parser.sync(sampleXml)

/**
 * Default behavior:
 * - first use key to match by element localName and then by attribute name
 * - if element has no children or attributes, then automaticaly resolve as the textContent
 * - elements are assumed to be single instance unless a rule is added to indicate more than 1 by specifying type = 'elements'
 * 
 * Rules can be used to customize the behavior of key resolution
 */
const rules:Rule[] = [
    {key:'plant', type: 'elements'},
    {key:'value', type: 'attribute'},
    {key:'green', asKey: 'yellow', asNamespace: 'http://localhost/green'},
    {key:'v', asKey: 'type', whenLocalName: 'plant'},
    {key:'v', asKey: 'value'},
]
const jsxn:any = makeXmlProxy(document.documentElement as Element, rules)

console.log(jsxn.tree.branch === 'br1')
console.log(jsxn.plant[1].type === 'bush')
console.log(jsxn.option.value === 'true')
console.log(jsxn.option.v === 'false')
console.log(jsxn.plant[0].v === 'shrub')
console.log(jsxn.yellow.a === 'b')
console.log(jsxn.green === 'green')