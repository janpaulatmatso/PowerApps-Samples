<#
.SYNOPSIS
Creates the Dataverse tables used by the ListBuilder code component.

.DESCRIPTION
Creates (when they don't exist yet) a publisher, a solution and these tables:

  sample_lijst       Lijst       A user defined list with a name and a description
  sample_lijstkolom  Lijstkolom  A column of a list, with its data type
  sample_lijstregel  Lijstregel  A data row of a list; the values are stored as JSON

sample_lijstkolom and sample_lijstregel have a lookup (sample_LijstId) to sample_lijst.
Deleting a list deletes its columns and rows.

The script reuses the Web API helper functions in dataverse/webapi/PS and can be
run more than once: existing tables and columns are skipped.

Requires PowerShell 7.4+ and the Az PowerShell module. See dataverse/webapi/PS/README.md.

.PARAMETER environmentUrl
The URL of your Dataverse environment, for example https://yourorg.crm.dynamics.com/

.EXAMPLE
./Create-ListTables.ps1 -environmentUrl 'https://yourorg.crm.dynamics.com/'
#>
param (
   [Parameter(Mandatory)]
   [string]
   $environmentUrl
)

$psSamples = Join-Path $PSScriptRoot '..\..\..\dataverse\webapi\PS'
. (Join-Path $psSamples 'Core.ps1')
. (Join-Path $psSamples 'TableOperations.ps1')
. (Join-Path $psSamples 'MetadataOperations.ps1')

if (-not $environmentUrl.EndsWith('/')) {
   $environmentUrl += '/'
}
Connect $environmentUrl

$languageCode = 1033
$prefix = 'sample'
# The option values of the sample_datatype choice must match the ColumnType enum in ListBuilder/types.ts
$optionValuePrefix = 72700

$publisherData = @{
   uniquename                     = 'examplepublisher'
   friendlyname                   = 'Example Publisher'
   description                    = 'An example publisher for samples'
   customizationprefix            = $prefix
   customizationoptionvalueprefix = $optionValuePrefix
}

$solutionData = @{
   uniquename   = 'listbuildersample'
   friendlyname = 'List Builder Sample'
   description  = 'Tables used by the ListBuilder code component sample'
   version      = '1.0.0.0'
}

#region Helper functions

function Test-TableExists {
   param ([string] $logicalName)
   $result = Get-Tables -query "?`$filter=LogicalName eq '$logicalName'&`$select=LogicalName"
   return $result.value.Length -gt 0
}

function Test-ColumnExists {
   param ([string] $tableLogicalName, [string] $columnLogicalName)
   $result = Get-TableColumns `
      -tableLogicalName $tableLogicalName `
      -query "?`$filter=LogicalName eq '$columnLogicalName'&`$select=LogicalName"
   return $null -ne $result
}

function Add-Table {
   param ([string] $schemaName, [string] $displayName, [string] $pluralName, [string] $description, [string] $nameDescription)

   if (Test-TableExists -logicalName $schemaName.ToLower()) {
      Write-Host "Table $schemaName already exists"
      return
   }
   $table = @{
      '@odata.type'         = 'Microsoft.Dynamics.CRM.EntityMetadata'
      SchemaName            = $schemaName
      DisplayName           = New-Label -label $displayName -languageCode $languageCode
      DisplayCollectionName = New-Label -label $pluralName -languageCode $languageCode
      Description           = New-Label -label $description -languageCode $languageCode
      HasActivities         = $false
      HasNotes              = $false
      OwnershipType         = 'UserOwned'
      Attributes            = @(
         New-PrimaryNameAttribute -prefix $prefix -description $nameDescription -languageCode $languageCode
      )
   }
   New-Table -body $table -solutionUniqueName $solutionData.uniquename | Out-Null
   Write-Host "Table $schemaName created"
}

function Add-Column {
   param ([string] $tableLogicalName, [hashtable] $column)

   if (Test-ColumnExists -tableLogicalName $tableLogicalName -columnLogicalName $column.SchemaName.ToLower()) {
      Write-Host "Column $($column.SchemaName) already exists"
      return
   }
   New-Column `
      -tableLogicalName $tableLogicalName `
      -column $column `
      -solutionUniqueName $solutionData.uniquename | Out-Null
   Write-Host "Column $($column.SchemaName) created"
}

function New-ColumnDefinition {
   param ([string] $type, [string] $schemaName, [string] $displayName, [string] $description)
   return @{
      '@odata.type' = "Microsoft.Dynamics.CRM.$type"
      SchemaName    = $schemaName
      RequiredLevel = @{ Value = 'None' }
      DisplayName   = New-Label -label $displayName -languageCode $languageCode
      Description   = New-Label -label $description -languageCode $languageCode
   }
}

function New-MemoColumn {
   param ([string] $schemaName, [string] $displayName, [string] $description, [int] $maxLength)
   $column = New-ColumnDefinition -type 'MemoAttributeMetadata' -schemaName $schemaName `
      -displayName $displayName -description $description
   $column.Format = 'TextArea'
   $column.MaxLength = $maxLength
   return $column
}

# Adds a lookup to sample_lijst on the referencing table. Deleting a list deletes the related rows.
function Add-ListLookup {
   param ([string] $referencingTable, [string] $relationshipSchemaName)

   if (Test-ColumnExists -tableLogicalName $referencingTable -columnLogicalName "$($prefix)_lijstid") {
      Write-Host "Lookup $($prefix)_LijstId on $referencingTable already exists"
      return
   }
   $relationship = @{
      '@odata.type'                           = 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata'
      SchemaName                              = $relationshipSchemaName
      ReferencedEntity                        = "$($prefix)_lijst"
      ReferencedAttribute                     = "$($prefix)_lijstid"
      ReferencingEntity                       = $referencingTable
      # The code component binds the lookup with this navigation property name
      ReferencingEntityNavigationPropertyName = "$($prefix)_LijstId"
      CascadeConfiguration                    = @{
         Assign     = 'Cascade'
         Share      = 'Cascade'
         Unshare    = 'Cascade'
         RollupView = 'NoCascade'
         Reparent   = 'Cascade'
         Delete     = 'Cascade'
         Merge      = 'NoCascade'
      }
      Lookup                                  = @{
         '@odata.type' = 'Microsoft.Dynamics.CRM.LookupAttributeMetadata'
         SchemaName    = "$($prefix)_LijstId"
         RequiredLevel = @{ Value = 'ApplicationRequired' }
         DisplayName   = New-Label -label 'Lijst' -languageCode $languageCode
         Description   = New-Label -label 'The list this record belongs to' -languageCode $languageCode
      }
   }
   New-Relationship -relationship $relationship -solutionUniqueName $solutionData.uniquename | Out-Null
   Write-Host "Lookup $($prefix)_LijstId on $referencingTable created"
}

#endregion Helper functions

Invoke-DataverseCommands {

   #region Publisher and solution

   $publishers = (Get-Records `
         -setName 'publishers' `
         -query "?`$filter=uniquename eq '$($publisherData.uniquename)'&`$select=publisherid,customizationprefix,customizationoptionvalueprefix").value
   if ($publishers.Length -eq 0) {
      $publisherId = New-Record -setName 'publishers' -body $publisherData
      Write-Host "Publisher $($publisherData.uniquename) created"
   }
   else {
      $publisherId = $publishers[0].publisherid
      if ($publishers[0].customizationprefix -ne $prefix -or
         $publishers[0].customizationoptionvalueprefix -ne $optionValuePrefix) {
         throw "Publisher $($publisherData.uniquename) exists with prefixes '$($publishers[0].customizationprefix)' and " +
         "$($publishers[0].customizationoptionvalueprefix) instead of '$prefix' and $optionValuePrefix."
      }
      Write-Host "Publisher $($publisherData.uniquename) already exists"
   }

   $solutions = (Get-Records `
         -setName 'solutions' `
         -query "?`$filter=uniquename eq '$($solutionData.uniquename)'&`$select=solutionid").value
   if ($solutions.Length -eq 0) {
      $solutionData['publisherid@odata.bind'] = "/publishers($publisherId)"
      New-Record -setName 'solutions' -body $solutionData | Out-Null
      Write-Host "Solution $($solutionData.uniquename) created"
   }
   else {
      Write-Host "Solution $($solutionData.uniquename) already exists"
   }

   #endregion Publisher and solution

   #region sample_lijst

   Add-Table `
      -schemaName "$($prefix)_Lijst" `
      -displayName 'Lijst' `
      -pluralName 'Lijsten' `
      -description 'A list that a user created with the ListBuilder code component' `
      -nameDescription 'The name of the list'

   Add-Column -tableLogicalName "$($prefix)_lijst" -column (New-MemoColumn `
         -schemaName "$($prefix)_Omschrijving" `
         -displayName 'Omschrijving' `
         -description 'The description of the list' `
         -maxLength 2000)

   $departmentColumn = New-ColumnDefinition -type 'StringAttributeMetadata' -schemaName "$($prefix)_Afdeling" `
      -displayName 'Afdeling' -description 'The department that owns the list'
   $departmentColumn.MaxLength = 200
   $departmentColumn.FormatName = @{ Value = 'Text' }
   Add-Column -tableLogicalName "$($prefix)_lijst" -column $departmentColumn

   $processColumn = New-ColumnDefinition -type 'StringAttributeMetadata' -schemaName "$($prefix)_Proces" `
      -displayName 'Proces' -description 'The process the list belongs to'
   $processColumn.MaxLength = 200
   $processColumn.FormatName = @{ Value = 'Text' }
   Add-Column -tableLogicalName "$($prefix)_lijst" -column $processColumn

   #endregion sample_lijst

   #region sample_lijstkolom

   Add-Table `
      -schemaName "$($prefix)_LijstKolom" `
      -displayName 'Lijstkolom' `
      -pluralName 'Lijstkolommen' `
      -description 'A column of a list created with the ListBuilder code component' `
      -nameDescription 'The display name of the column'

   Add-ListLookup -referencingTable "$($prefix)_lijstkolom" -relationshipSchemaName "$($prefix)_Lijst_LijstKolom"

   $keyColumn = New-ColumnDefinition -type 'StringAttributeMetadata' -schemaName "$($prefix)_Sleutel" `
      -displayName 'Sleutel' -description 'Key of the column in the JSON values of a list row. Never changes.'
   $keyColumn.MaxLength = 100
   $keyColumn.FormatName = @{ Value = 'Text' }
   Add-Column -tableLogicalName "$($prefix)_lijstkolom" -column $keyColumn

   # The values must match the ColumnType enum in ListBuilder/types.ts
   $dataTypes = @(
      @{ Value = 0; Label = 'Tekst' },
      @{ Value = 1; Label = 'Meerregelige tekst' },
      @{ Value = 2; Label = 'Geheel getal' },
      @{ Value = 3; Label = 'Decimaal getal' },
      @{ Value = 4; Label = 'Datum' },
      @{ Value = 5; Label = 'Ja/Nee' },
      @{ Value = 6; Label = 'Keuzelijst' }
   )
   $dataTypeColumn = New-ColumnDefinition -type 'PicklistAttributeMetadata' -schemaName "$($prefix)_DataType" `
      -displayName 'Datatype' -description 'The data type of the column'
   $dataTypeColumn.RequiredLevel = @{ Value = 'ApplicationRequired' }
   $dataTypeColumn.OptionSet = @{
      '@odata.type' = 'Microsoft.Dynamics.CRM.OptionSetMetadata'
      OptionSetType = 'Picklist'
      IsGlobal      = $false
      Options       = @($dataTypes | ForEach-Object {
            @{
               Value = $optionValuePrefix * 10000 + $_.Value
               Label = New-Label -label $_.Label -languageCode $languageCode
            }
         })
   }
   Add-Column -tableLogicalName "$($prefix)_lijstkolom" -column $dataTypeColumn

   Add-Column -tableLogicalName "$($prefix)_lijstkolom" -column (New-MemoColumn `
         -schemaName "$($prefix)_Opties" `
         -displayName 'Opties' `
         -description 'The options of a choice column, as a JSON array' `
         -maxLength 10000)

   $requiredColumn = New-ColumnDefinition -type 'BooleanAttributeMetadata' -schemaName "$($prefix)_Verplicht" `
      -displayName 'Verplicht' -description 'Whether a value is required'
   $requiredColumn.DefaultValue = $false
   $requiredColumn.OptionSet = @{
      '@odata.type' = 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata'
      TrueOption    = @{ Value = 1; Label = New-Label -label 'Ja' -languageCode $languageCode }
      FalseOption   = @{ Value = 0; Label = New-Label -label 'Nee' -languageCode $languageCode }
   }
   Add-Column -tableLogicalName "$($prefix)_lijstkolom" -column $requiredColumn

   $orderColumn = New-ColumnDefinition -type 'IntegerAttributeMetadata' -schemaName "$($prefix)_Volgorde" `
      -displayName 'Volgorde' -description 'The position of the column in the list'
   $orderColumn.MinValue = 0
   $orderColumn.MaxValue = 10000
   $orderColumn.Format = 'None'
   Add-Column -tableLogicalName "$($prefix)_lijstkolom" -column $orderColumn

   #endregion sample_lijstkolom

   #region sample_lijstregel

   Add-Table `
      -schemaName "$($prefix)_LijstRegel" `
      -displayName 'Lijstregel' `
      -pluralName 'Lijstregels' `
      -description 'A data row of a list created with the ListBuilder code component' `
      -nameDescription 'A summary of the first values of the row'

   Add-ListLookup -referencingTable "$($prefix)_lijstregel" -relationshipSchemaName "$($prefix)_Lijst_LijstRegel"

   Add-Column -tableLogicalName "$($prefix)_lijstregel" -column (New-MemoColumn `
         -schemaName "$($prefix)_Waarden" `
         -displayName 'Waarden' `
         -description 'The values of the row as a JSON object, keyed by the sample_sleutel of each column' `
         -maxLength 1048576)

   #endregion sample_lijstregel

   Write-Host 'Done. Remember to give users a security role with privileges on the three tables.' -ForegroundColor Green
}
